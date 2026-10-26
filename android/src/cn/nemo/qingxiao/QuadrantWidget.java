package cn.nemo.qingxiao;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.*;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;

/** Local-only launcher widget. No account or network credentials cross this boundary. */
public class QuadrantWidget extends AppWidgetProvider {
 static final String REFRESH="cn.nemo.qingxiao.WIDGET_REFRESH";
 static final String FOCUS="cn.nemo.qingxiao.WIDGET_FOCUS";
 static final int[] SWITCHES={R.id.switch0,R.id.switch1,R.id.switch2,R.id.switch3};
 static final int[] BACKGROUNDS={R.drawable.widget_q0,R.drawable.widget_q1,R.drawable.widget_q2,R.drawable.widget_q3};
 static final int[] LISTS={R.id.list0,R.id.list1,R.id.list2,R.id.list3};
 static final int[] EMPTY={R.id.empty0,R.id.empty1,R.id.empty2,R.id.empty3};
 static final int[] HEADS={R.id.head0,R.id.head1,R.id.head2,R.id.head3};
 static final int[] ADDS={R.id.add0,R.id.add1,R.id.add2,R.id.add3};
 static final String[] LABELS={"重要 · 紧急","重要 · 不紧急","不重要 · 紧急","不重要 · 不紧急"};
 static final String[] SHORT_LABELS={"重·急","重·不急","不重·急","不重·不急"};

 static List<JSONObject> tasks(Context c) throws Exception {
  List<JSONObject> result=new ArrayList<>();
  if(AppLock.enabled(c))return result;
  JSONArray items=new JSONObject(Store.read(c)).getJSONArray("items");TaskTree tree=new TaskTree(items);
  for(int n=0;n<items.length();n++){
   JSONObject t=items.getJSONObject(n);
   if(tree.root(t.optString("id"))&&!t.optBoolean("done")&&!t.optBoolean("deleted")&&!t.optBoolean("purged")&&!"note".equals(t.optString("kind"))){JSONObject copy=new JSONObject(t.toString());copy.put("_treeProgress",tree.progress(t.getString("id")));result.add(copy);}
  }
  result.sort(Comparator.comparingLong(t->t.optLong("order")));
  return result;
 }

 static Intent target(Context c,int q,boolean add){
  return new Intent(c,MainActivity.class).setAction("cn.nemo.qingxiao.WIDGET_OPEN")
   .setData(Uri.parse("qingxiao://widget/"+q+"/"+add))
   .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP)
   .putExtra("widget",true).putExtra("widgetQ",q).putExtra("widgetAdd",add);
 }
 static PendingIntent open(Context c,int q,boolean add){
  return PendingIntent.getActivity(c,100+q*2+(add?1:0),target(c,q,add),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
 }
 static PendingIntent focus(Context c,int widgetId,int q){
  Intent intent=new Intent(c,QuadrantWidget.class).setAction(FOCUS)
   .setData(Uri.parse("qingxiao://widget-focus/"+widgetId+"/"+q))
   .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,widgetId).putExtra("quadrant",q);
  return PendingIntent.getBroadcast(c,300,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
 }
 public static void refresh(Context c){
  // Refresh failures must never turn a successful task save into an apparent failure.
  try{AppWidgetManager m=AppWidgetManager.getInstance(c);int[] ids=m.getAppWidgetIds(new ComponentName(c,QuadrantWidget.class));update(c,m,ids);}catch(Exception e){android.util.Log.w("QingxiaoWidget","Widget refresh unavailable");}
 }
 static void update(Context c,AppWidgetManager manager,int[] ids){
  if(ids.length==0)return;
  boolean locked=AppLock.enabled(c),failed=false;List<JSONObject> tasks=Collections.emptyList();
  try{tasks=tasks(c);}catch(Exception e){failed=true;}
  int[] counts=new int[4];for(JSONObject t:tasks){int q=t.optInt("quadrant",-1);if(q>=0&&q<4)counts[q]++;}
  for(int id:ids){
   int selected=c.getSharedPreferences("widget-view",0).getInt("focus:"+id,-1);
   if(selected<0||selected>3)selected=-1;
   Bundle options=manager.getAppWidgetOptions(id);
   RemoteViews views=null;
   // Android 12+ launchers can supply the exact dp sizes, including both orientations.
   if(Build.VERSION.SDK_INT>=31){
    ArrayList<SizeF> sizes=options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
    if(sizes!=null&&!sizes.isEmpty()&&sizes.size()<=16){
     Map<SizeF,RemoteViews> layouts=new LinkedHashMap<>();
     for(SizeF size:sizes)if(size!=null&&size.getWidth()>0&&size.getHeight()>0&&Float.isFinite(size.getWidth())&&Float.isFinite(size.getHeight()))
      layouts.put(size,layout(c,id,selected,locked,failed,counts,size.getWidth(),size.getHeight()));
     if(!layouts.isEmpty())views=new RemoteViews(layouts);
    }
   }
   if(views==null){
    // Older Android and OEM launchers may omit OPTION_APPWIDGET_SIZES.
    int minW=positive(options,AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,320);
    int maxW=positive(options,AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,minW);
    int minH=positive(options,AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,280);
    int maxH=positive(options,AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,minH);
    views=new RemoteViews(layout(c,id,selected,locked,failed,counts,maxW,minH),layout(c,id,selected,locked,failed,counts,minW,maxH));
   }
   manager.updateAppWidget(id,views);
   for(int list:LISTS)manager.notifyAppWidgetViewDataChanged(id,list);
   if(selected>=0)manager.notifyAppWidgetViewDataChanged(id,R.id.focus_list);
  }
 }
 static int positive(Bundle options,String key,int fallback){int value=options.getInt(key);return value>0?value:fallback;}

 static RemoteViews layout(Context c,int id,int selected,boolean locked,boolean failed,int[] counts,float width,float height){
   float scale=Math.max(1f,c.getResources().getConfiguration().fontScale);
   boolean compact=height<340*scale;
   boolean narrow=width<300*scale;
   boolean shortLabels=width<260*scale;
   RemoteViews v=new RemoteViews(c.getPackageName(),compact?R.layout.quadrant_widget_compact:R.layout.quadrant_widget);
   // At small heights, keep space for at least one task per quadrant, even with larger fonts.
   v.setViewVisibility(R.id.widget_header,height<240*scale&&!locked&&!failed?View.GONE:View.VISIBLE);
   int count=0;for(int n:counts)count+=n;
   v.setTextViewText(R.id.widget_date,new SimpleDateFormat("M月d日 E",Locale.CHINA).format(new Date())+(locked||failed?"":" · "+count+" 项待办"));
   v.setViewVisibility(R.id.widget_matrix,locked||failed||selected>=0?View.GONE:View.VISIBLE);
   v.setViewVisibility(R.id.widget_focus,!locked&&!failed&&selected>=0?View.VISIBLE:View.GONE);
   v.setViewVisibility(R.id.widget_notice,locked||failed?View.VISIBLE:View.GONE);
   v.setTextViewText(R.id.widget_notice,locked?"应用密码保护已开启\n点此进入应用查看事项":"暂时无法读取事项\n点此进入应用检查");
   v.setOnClickPendingIntent(R.id.widget_notice,open(c,-1,false));
   v.setOnClickPendingIntent(R.id.widget_title,open(c,-1,false));
   v.setTextViewText(R.id.widget_hint,locked?"为保护隐私，桌面不展示事项内容":selected>=0?"点色块切换 · 总览返回 · 列表可上下滑动":"各象限可上下滑动 · 点标题放大 · ＋新增");
   Intent refresh=new Intent(c,QuadrantWidget.class).setAction(REFRESH);
   v.setOnClickPendingIntent(R.id.widget_refresh,PendingIntent.getBroadcast(c,200,refresh,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
   for(int q=0;q<4;q++){
    // Bound only the small navigation labels; task text still follows the user's font size.
    v.setTextViewTextSize(HEADS[q],TypedValue.COMPLEX_UNIT_DIP,10*Math.min(scale,1.3f));
    v.setTextViewText(HEADS[q],(shortLabels?SHORT_LABELS[q]:LABELS[q].replace(" · ","·"))+"  "+counts[q]);
    v.setContentDescription(HEADS[q],"展开"+LABELS[q]+"，"+counts[q]+" 项");
    v.setViewVisibility(ADDS[q],narrow?View.GONE:View.VISIBLE);
    v.setOnClickPendingIntent(HEADS[q],focus(c,id,q));
    v.setOnClickPendingIntent(ADDS[q],open(c,q,true));
    v.setTextViewText(EMPTY[q],compact?"暂无待办":"暂无待办\n点 ＋ 添加");
    v.setInt(EMPTY[q],"setMaxLines",compact?1:2);
    v.setContentDescription(EMPTY[q],"在"+LABELS[q]+"添加事项");
    v.setOnClickPendingIntent(EMPTY[q],open(c,q,true));
    Intent adapter=new Intent(c,QuadrantWidgetService.class).putExtra("quadrant",q)
     .setData(Uri.parse("qingxiao://widget-list/"+id+"/"+q+"/overview"));
    v.setRemoteAdapter(LISTS[q],adapter);v.setEmptyView(LISTS[q],EMPTY[q]);
    // Collection rows supply itemId through a fill-in Intent. The component is explicit.
    v.setPendingIntentTemplate(LISTS[q],PendingIntent.getActivity(c,1000+id*4+q,target(c,q,false).setData(Uri.parse("qingxiao://widget-row/"+id+"/"+q)),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_MUTABLE));
   }
   if(selected>=0){
    v.setInt(R.id.widget_focus,"setBackgroundResource",BACKGROUNDS[selected]);
    v.setTextViewTextSize(R.id.focus_title,TypedValue.COMPLEX_UNIT_DIP,14*Math.min(scale,1.4f));
    v.setTextViewText(R.id.focus_title,(shortLabels?SHORT_LABELS[selected]:LABELS[selected])+" · "+counts[selected]+" 项");
    v.setContentDescription(R.id.focus_title,LABELS[selected]+"，"+counts[selected]+" 项");
    v.setOnClickPendingIntent(R.id.focus_back,focus(c,id,-1));
    v.setOnClickPendingIntent(R.id.focus_add,open(c,selected,true));
    v.setOnClickPendingIntent(R.id.focus_empty,open(c,selected,true));
    for(int q=0;q<4;q++)v.setOnClickPendingIntent(SWITCHES[q],focus(c,id,q));
    Intent adapter=new Intent(c,QuadrantWidgetService.class).putExtra("quadrant",selected).putExtra("expanded",true)
     .setData(Uri.parse("qingxiao://widget-expanded/"+id+"/"+selected));
    v.setRemoteAdapter(R.id.focus_list,adapter);v.setEmptyView(R.id.focus_list,R.id.focus_empty);
    v.setPendingIntentTemplate(R.id.focus_list,PendingIntent.getActivity(c,5000+id*4+selected,target(c,selected,false).setData(Uri.parse("qingxiao://expanded-row/"+id+"/"+selected)),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_MUTABLE));
   }
   return v;
 }
 @Override public void onUpdate(Context c,AppWidgetManager m,int[] ids){update(c,m,ids);}
 @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options){update(c,m,new int[]{id});}
 @Override public void onReceive(Context c,Intent intent){
  super.onReceive(c,intent);String action=intent.getAction();
  if(FOCUS.equals(action)){
   int id=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1),q=intent.getIntExtra("quadrant",-1);
   AppWidgetManager m=AppWidgetManager.getInstance(c);AppWidgetProviderInfo info=m.getAppWidgetInfo(id);
   if(q>=-1&&q<=3&&info!=null&&new ComponentName(c,QuadrantWidget.class).equals(info.provider)){
    c.getSharedPreferences("widget-view",0).edit().putInt("focus:"+id,q).apply();update(c,m,new int[]{id});
   }
  }else if(REFRESH.equals(action)||Intent.ACTION_DATE_CHANGED.equals(action)||Intent.ACTION_TIME_CHANGED.equals(action)||Intent.ACTION_TIMEZONE_CHANGED.equals(action))refresh(c);
 }
 @Override public void onDeleted(Context c,int[] ids){android.content.SharedPreferences.Editor edit=c.getSharedPreferences("widget-view",0).edit();for(int id:ids)edit.remove("focus:"+id);edit.apply();}

 static void showSettings(Activity a){
  AppWidgetManager m=AppWidgetManager.getInstance(a);
  String help="默认4×3，给桌面App图标留出空间。长按组件拖动边框，可按你的桌面布局调整大小；实际格数由手机桌面决定。\n\n总览使用小字号单行列表，超长标题显示省略号，尽量多显示几条事项。每个列表都能上下滑动，拉大组件可以看到更多。放大象限后显示完整标题、日期、项目和子任务进度。点象限标题在组件内放大，点颜色切换，点「总览」返回。点事项看详情，点 ＋ 新增。较窄时收起 ＋，放大象限后仍可新增；「重/急」分别指重要/紧急。\n\n已有组件保留原尺寸，可手动缩小或重新添加。应用保存或收到同步数据后会自动刷新。开启应用密码时，桌面隐藏事项内容。";
  AlertDialog.Builder dialog=new AlertDialog.Builder(a).setTitle("四象限桌面小组件").setMessage(help).setNegativeButton("关闭",null).setNeutralButton("手动添加方法",(d,w)->manual(a));
  if(m.isRequestPinAppWidgetSupported())dialog.setPositiveButton("添加到桌面",(d,w)->{
   try{if(!m.requestPinAppWidget(new ComponentName(a,QuadrantWidget.class),null,null))manual(a);}catch(Exception e){manual(a);}
  });else dialog.setPositiveButton("查看添加方法",(d,w)->manual(a));
  dialog.show();
 }
 static void manual(Activity a){new AlertDialog.Builder(a).setTitle("添加到手机桌面").setMessage("回到桌面，长按空白处 → 添加小组件（或桌面工具）→ 找到「轻效 Todo / 四象限事项」→ 拖到空白桌面。\n\n部分手机可在小组件页面的「全部应用」或「安卓小部件」中找到。").setPositiveButton("知道了",null).show();}
}
