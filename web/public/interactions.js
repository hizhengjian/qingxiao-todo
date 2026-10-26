/* Shared touch/mouse interactions. Touch scrolling stays native until a gesture wins. */
(function () {
  'use strict';
  let gesture = null, opened = null, holdTimer, frame, deferredRender = false;
  let suppressClickUntil = 0, undoTimer;
  const undoStack = [], HOLD_MS = 420, UNDO_MS = 10000;
  const baseRender = render, baseRow = itemRow, baseBack = handleBack;
  const permanentDelete = deleteItem;
  const task = id => db.items.find(t => t.id === id);
  const editableTarget = e => e.target.closest('input,textarea,select,[contenteditable]');

  function haptic(kind = 'tick') {
    try {
      if (native && Native.haptic) Native.haptic(kind);
      else navigator.vibrate?.(kind === 'hold' ? 25 : 12);
    } catch {}
  }
  function persist(edit) {
    const before = C.clone(db.items);
    try {
      edit();
      if (!save()) { db.items = before; render(); return false; }
    } catch (e) { db.items = before; render(); toast(e.message); return false; }
    render(); scheduleSync(); return true;
  }
  function restoreFields(id, expected, previous, extra) {
    const t = task(id);
    if (!t || Object.entries(expected).some(([k, v]) => t[k] !== v)) {
      toast('事项已再次修改，无法撤销这一步'); return false;
    }
    return persist(() => { Object.assign(t, previous); C.touch(t); extra?.(); });
  }
  function undoNotice() {
    clearTimeout(undoTimer);
    while (undoStack.length && undoStack.at(-1).expires <= Date.now()) undoStack.pop();
    const entry = undoStack.at(-1);
    if (!entry) { $('toast').style.display = 'none'; return; }
    clearTimeout(toastId);
    $('toast').innerHTML = `<span>${esc(entry.text)}</span><button onclick="runUndo()" aria-label="撤销">撤销${undoStack.length > 1 ? ' (' + undoStack.length + ')' : ''}</button>`;
    $('toast').style.display = 'flex';
    undoTimer = setTimeout(undoNotice, Math.max(1, entry.expires - Date.now()));
  }
  toastUndo = function (text, fn) {
    const now = Date.now();
    for (let i = undoStack.length - 1; i >= 0; i--) if (undoStack[i].expires <= now) undoStack.splice(i, 1);
    undoStack.push({text, fn, expires: now + UNDO_MS});
    if (undoStack.length > 10) undoStack.shift();
    undoNotice();
  };
  runUndo = function () {
    clearTimeout(undoTimer);
    while (undoStack.length && undoStack.at(-1).expires <= Date.now()) undoStack.pop();
    const entry = undoStack.pop();
    if (!entry) return undoNotice();
    if (entry.fn() === false) return;
    haptic();
    if (undoStack.length) undoNotice();
    else toast('已撤销');
  };
  toggleItem = function (id) {
    const t = task(id); if (!t || t.purged) return;
    const before = {done: !!t.done, completedAt: t.completedAt || 0, deleted: !!t.deleted};
    const known = new Set(db.items.map(x => x.id));
    if (!persist(() => { if (t.deleted) t.deleted = false; else C.complete(db, t); C.touch(t); })) return;
    const generated = db.items.filter(x => !known.has(x.id)).map(x => ({id: x.id, updatedAt: x.updatedAt}));
    const expected = {done: t.done, deleted: t.deleted};
    closePanel(true); haptic();
    toastUndo(before.deleted ? '已从回收站恢复' : t.done ? '事项已完成' : '已恢复为未完成', () =>
      restoreFields(id, expected, before, () => {
        for (const x of generated) {
          const n = task(x.id);
          if (n && n.updatedAt === x.updatedAt) { n.deleted = true; C.touch(n); }
        }
      }));
  };
  deleteItem = function (id) {
    const t = task(id); if (!t) return;
    if (t.deleted) return permanentDelete(id);
    if (!persist(() => { t.deleted = true; C.touch(t); })) return;
    closePanel(true); haptic();
    toastUndo('已移入回收站', () => restoreFields(id, {deleted: true}, {deleted: false}));
  };
  moveQuadrant = function (id, q) {
    const t = task(id);
    if (!t || t.deleted || t.done || !Number.isInteger(q) || q < 0 || q > 3 || t.quadrant === q) return;
    const before = {quadrant: t.quadrant, order: t.order || 0}, focus = matrixFocus;
    const order = Math.min(0, ...db.items.filter(x => !x.deleted && x.quadrant === q).map(x => x.order || 0)) - 1;
    if (!persist(() => { t.quadrant = q; t.order = order; C.touch(t); })) return;
    if (view === 'matrix' && matrixFocus >= 0) { matrixFocus = q; render(); }
    closePanel(true); haptic();
    toastUndo('已移到' + Q[q].replace('-', ' · '), () => {
      const ok = restoreFields(id, {quadrant: q, order}, before);
      if (ok && view === 'matrix') { matrixFocus = focus; render(); }
      return ok;
    });
  };

  itemRow = function (t) {
    const right = t.deleted ? '恢复' : t.done ? '未完成' : '完成';
    return `<div class="task-swipe" data-swipe-id="${esc(t.id)}" style="--q:var(--q${t.quadrant})"><button class="swipe-action swipe-complete" tabindex="-1" disabled aria-hidden="true" aria-label="${right} ${esc(t.title)}" onclick="QGestures.act(${arg(t.id)},'complete')"><span>${t.deleted ? '↶' : '✓'}</span><b>${right}</b></button>${!t.deleted ? `<button class="swipe-action swipe-delete" tabindex="-1" disabled aria-hidden="true" aria-label="删除 ${esc(t.title)}" onclick="QGestures.act(${arg(t.id)},'delete')"><span>⌫</span><b>删除</b></button>` : ''}${baseRow(t)}</div>`;
  };
  function closeSwipe() {
    if (!opened) return;
    opened.classList.remove('swipe-open', 'swipe-ready');
    opened.style.removeProperty('--swipe-x');
    opened.querySelectorAll('.swipe-action').forEach(b => { b.disabled = true; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); });
    opened = null;
  }
  function action(id, type) {
    closeSwipe();
    const t = task(id); if (!t) return;
    if (type === 'delete') { if (!t.deleted) deleteItem(id); }
    else toggleItem(id);
  }
  function pointInQuadrant(x, y) {
    return document.elementFromPoint(x, y)?.closest('#main .quadrant');
  }
  function movePreview(g) {
    const rect = g.ghost.getBoundingClientRect();
    g.ghost.style.left = Math.max(6, Math.min(innerWidth - rect.width - 6, g.x - rect.width / 2)) + 'px';
    g.ghost.style.top = Math.max(6, Math.min(innerHeight - rect.height - 6, g.y - rect.height - 20)) + 'px';
    if(window.QDrag)QDrag.preview(g);
  }
  function scrollDuringDrag(time) {
    if (!gesture || gesture.mode !== 'drag') return;
    const g = gesture, list = pointInQuadrant(g.x, g.y)?.querySelector('.quad-list');
    const elapsed=Math.min(32,Math.max(0,time-(g.frameAt||time)));g.frameAt=time;
    if (list) {
      const r = list.getBoundingClientRect(),edge=Math.min(56,r.height/4);
      if (g.y >= r.top && g.y <= r.bottom) {
        let speed=g.y<r.top+edge?-(r.top+edge-g.y)/edge:g.y>r.bottom-edge?(g.y-(r.bottom-edge))/edge:0;
        if(speed)list.scrollTop+=speed*elapsed*.65;
      }
    }
    movePreview(g);
    frame = requestAnimationFrame(scrollDuringDrag);
  }

  function startDrag() {
    const g = gesture, t = g && task(g.id);
    if(!window.QDrag)return;
    if (!g || g.mode !== 'pending' || view !== 'matrix' || !t || t.deleted || t.done || t.kind === 'note' || !$('overlay').hidden) return;
    closeSwipe(); g.mode = 'drag'; g.target = -1;
    if (g.input === 'pointer') { try { g.row.setPointerCapture(g.identifier); } catch {} }
    g.row.classList.add('dragging');
    g.ghost = document.createElement('div'); g.ghost.className = 'task-drag-preview';
    g.ghost.style.setProperty('--q', `var(--q${t.quadrant})`);
    g.ghost.innerHTML = `<strong>${esc(t.title)}</strong><small>移动事项</small>`;
    g.ghost.setAttribute('aria-hidden', 'true');
    g.hint = document.createElement('div'); g.hint.className = 'task-drag-hint'; g.hint.setAttribute('role', 'status');
    document.body.append(g.ghost, g.hint); document.body.classList.add('task-drag-active');
    window.QDrag?.start(g,t);haptic('hold'); movePreview(g); frame = requestAnimationFrame(scrollDuringDrag);
  }
  function begin(e, x, y, input, identifier) {
    const row = e.target.closest('.task-row');
    if (!row || !row.closest('#main') || !e.target.closest('.task-open') || !$('overlay').hidden) return;
    if (gesture) cancel();
    const wrap = row.closest('.task-swipe'), same = wrap === opened;
    const offset = same ? Number(wrap.dataset.offset || 0) : 0;
    if (!same) closeSwipe();
    gesture = {id: row.dataset.taskId, row, wrap, x, y, startX: x, startY: y, input, identifier, mode: 'pending', offset, beganOpen: same};
    if (view === 'matrix') holdTimer = setTimeout(startDrag, HOLD_MS);
  }
  function move(e, x, y) {
    const g = gesture; if (!g) return;
    g.x = x; g.y = y;
    const dx = x - g.startX, dy = y - g.startY;
    if (g.mode === 'pending') {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { cancel(false); return; }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) { clearTimeout(holdTimer); g.mode = 'swipe'; if (g.input === 'pointer') { try { g.row.setPointerCapture(g.identifier); } catch {} } }
      else if (Math.hypot(dx, dy) > 18) { cancel(false); return; }
      else return;
    }
    if (e.cancelable) e.preventDefault();
    if (g.mode === 'drag') {g.moved ||= Math.hypot(dx,dy)>8;movePreview(g); return; }
    const width = g.wrap.clientWidth;
    let offset = Math.max(-width * .9, Math.min(width * .9, g.offset + dx));
    if (task(g.id)?.deleted) offset = Math.max(0, offset);
    g.current = offset; g.threshold = Math.min(170, Math.max(108, width * .66));
    const ready = Math.abs(offset) >= g.threshold;
    if (ready && !g.ready) haptic();
    g.ready = ready;
    g.wrap.classList.toggle('swipe-ready', ready);
    g.wrap.classList.add('swiping');
    g.wrap.style.setProperty('--swipe-x', offset + 'px');
    g.wrap.dataset.direction = offset >= 0 ? 'right' : 'left';
    const b = g.wrap.querySelector(offset >= 0 ? '.swipe-complete' : '.swipe-delete');
    if (b) { b.querySelector('b').textContent = ready ? (offset >= 0 ? '松手' + (task(g.id)?.deleted ? '恢复' : task(g.id)?.done ? '还原' : '完成') : '松手删除') : (offset >= 0 ? (task(g.id)?.deleted ? '恢复' : task(g.id)?.done ? '未完成' : '完成') : '删除'); }
  }
  function clean(g) {
    clearTimeout(holdTimer); cancelAnimationFrame(frame);
    g.row.classList.remove('dragging'); g.wrap.classList.remove('swiping', 'swipe-ready');
    window.QDrag?.cleanup(g);g.ghost?.remove(); g.hint?.remove(); document.body.classList.remove('task-drag-active');
    document.querySelectorAll('.drop-target').forEach(q => q.classList.remove('drop-target'));
    gesture = null;
  }
  function flush() { if (deferredRender) { deferredRender = false; render(); } }
  function cancel(blockClick = true) {
    const g = gesture; if (!g) return;
    if (blockClick && g.mode !== 'pending') suppressClickUntil = Date.now() + 450;
    clean(g); g.wrap.style.removeProperty('--swipe-x'); closeSwipe(); flush();
  }
  function finish(e, x, y) {
    const g = gesture; if (!g) return;
    const mode = g.mode;if(mode==='drag'){g.x=x;g.y=y;movePreview(g);}clean(g);
    if (mode === 'pending') {
      if (g.beganOpen) { closeSwipe(); suppressClickUntil = Date.now() + 450; }
      flush(); return;
    }
    if (e.cancelable) e.preventDefault();
    suppressClickUntil = Date.now() + 450;
    if (mode === 'drag') {
      window.QDrag?.commit(g);
      flush(); return;
    }
    const offset = g.current || 0;
    if (g.ready) { g.wrap.style.removeProperty('--swipe-x'); action(g.id, offset > 0 ? 'complete' : 'delete'); }
    else if (Math.abs(offset) >= 34) {
      closeSwipe(); opened = g.wrap;
      const distance = Math.min(80, g.wrap.clientWidth * .42) * Math.sign(offset);
      opened.dataset.offset = distance; opened.style.setProperty('--swipe-x', distance + 'px'); opened.classList.add('swipe-open');
      const b = opened.querySelector(offset > 0 ? '.swipe-complete' : '.swipe-delete');
      if (b) { b.disabled = false; b.tabIndex = 0; b.setAttribute('aria-hidden', 'false'); }
    } else { g.wrap.style.removeProperty('--swipe-x'); closeSwipe(); }
    flush();
  }
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { cancel(); return; }
    const t = e.changedTouches[0]; begin(e, t.clientX, t.clientY, 'touch', t.identifier);
  }, {passive: true});
  document.addEventListener('touchmove', e => {
    if (gesture?.input !== 'touch') return;
    if (e.touches.length !== 1) { cancel(); return; }
    const t = [...e.touches].find(t => t.identifier === gesture.identifier);
    if (t) move(e, t.clientX, t.clientY);
  }, {passive: false});
  document.addEventListener('touchend', e => {
    if (gesture?.input !== 'touch') return;
    const t = [...e.changedTouches].find(t => t.identifier === gesture.identifier);
    if (t) finish(e, t.clientX, t.clientY);
  }, {passive: false});
  document.addEventListener('touchcancel', () => cancel());
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    begin(e, e.clientX, e.clientY, 'pointer', e.pointerId);

  });
  document.addEventListener('pointermove', e => { if (gesture?.input === 'pointer' && e.pointerId === gesture.identifier) move(e, e.clientX, e.clientY); }, {passive: false});
  document.addEventListener('pointerup', e => { if (gesture?.input === 'pointer' && e.pointerId === gesture.identifier) finish(e, e.clientX, e.clientY); });
  document.addEventListener('pointercancel', e => { if (gesture?.input === 'pointer') cancel(); });
  document.addEventListener('contextmenu', e => { if (e.target.closest('.task-row')) e.preventDefault(); });
  document.addEventListener('dragstart', e => { if (e.target.closest('.task-row')) e.preventDefault(); });
  document.addEventListener('click', e => {
    if (Date.now() < suppressClickUntil && e.detail !== 0 && !e.target.closest('.swipe-action,#toast')) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (opened && !e.target.closest('.swipe-action')) {
      const same = e.target.closest('.task-swipe') === opened; closeSwipe();
      if (same) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    }
    // Overview taps expand the quadrant; explicit controls remain immediate.
    const quadrant = e.target.closest('#main .quadrant');
    if (view === 'matrix' && matrixFocus < 0 && quadrant && $('overlay').hidden) {
      const control = e.target.closest('button,input,textarea,select,a,form');
      if (!control || control.classList.contains('task-open')) {
        e.preventDefault(); e.stopImmediatePropagation();
        expandQuadrant(Number(quadrant.dataset.quadrant));
      }
    }
  }, true);
  window.addEventListener('blur', () => { cancel(); closeSwipe(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancel(); closeSwipe(); } });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !editableTarget(e) && $('overlay').hidden && undoStack.length) { e.preventDefault(); runUndo(); }
  });
  handleBack = function () {
    if (gesture) { cancel(); return true; }
    if (opened) { closeSwipe(); return true; }
    return baseBack();
  };
  render = function () {
    if (gesture) { deferredRender = true; return; }
    const reveal = opened && lastRenderedView === view ? {id: opened.dataset.swipeId, offset: Number(opened.dataset.offset)} : null;
    deferredRender = false; closeSwipe(); baseRender();
    if (reveal) {
      const wrap = [...document.querySelectorAll('.task-swipe')].find(w => w.dataset.swipeId === reveal.id);
      const b = wrap?.querySelector(reveal.offset > 0 ? '.swipe-complete' : '.swipe-delete');
      if (b) {
        opened = wrap;
        const distance = Math.min(80, wrap.clientWidth * .42) * Math.sign(reveal.offset);
        wrap.dataset.offset = distance; wrap.dataset.direction = distance > 0 ? 'right' : 'left';
        wrap.style.setProperty('--swipe-x', distance + 'px'); wrap.classList.add('swipe-open');
        b.disabled = false; b.tabIndex = 0; b.setAttribute('aria-hidden', 'false');
      }
    }
  };
  window.QGestures = {act: action, cancel, close: closeSwipe, peekUndo:()=>undoStack.at(-1), active:()=>!!(gesture||opened)};
  window.gestureHelp = function () {
    show('事项快捷操作', '<div class="gesture-guide"><p><strong>点一下放大象限</strong><br>总览中点事项文字或空白区域放大，再点事项查看详情。点其他颜色条切换，点收起按钮返回总览。</p><p><strong>长按后拖动</strong><br>按住事项约半秒，上下拖动到插入线处松手，就能调整次序。主任务带上整棵分支；子任务也能同级排序。拖到另一颜色区域可移动优先级，子任务会提升为主任务。</p><p><strong>拖成子任务</strong><br>拖到目标事项右侧并稍停，出现“松手放入子任务”提示后再松手。拖到象限标题可提升为主任务；拖到列表上下边缘会自动滚动。移出区域松手或按返回可取消，操作后10秒内可撤销。</p><p><strong>右滑完成 · 左滑删除</strong><br>轻滑显示按钮，点击执行；滑得更远，看到“松手完成 / 删除”后松手即可执行。</p><p><strong>操作可以撤销</strong><br>完成、删除、移动后，10秒内点底部“撤销”；连续操作可逐步撤销。删除的事项也可以在设置里的回收站恢复。</p><p><strong>上下滑动照常滚动</strong><br>完成按钮、番茄按钮和更多菜单都可以直接点击。电脑也可以长按拖动，或用 Ctrl / ⌘ + Z 撤销。</p></div>');
  };
  const previousMatrix = matrixHtml;
  matrixHtml = function () {
    return previousMatrix().replace('</small></div>', '</small><button class="gesture-help" aria-label="事项手势说明" onclick="gestureHelp()">?</button></div>');
  };
  render();
})();
