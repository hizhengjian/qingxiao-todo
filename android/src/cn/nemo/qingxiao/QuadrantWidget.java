package cn.nemo.qingxiao;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.*;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;

/** Local-only launcher widget. No account or network credentials cross this boundary. */
public class QuadrantWidget extends AppWidgetProvider {
 static final String REFRESH="cn.nemo.qingxiao.WIDGET_REFRESH";
 static final int[] LISTS={R.id.list0,R.id.list1,R.id.list2,R.id.list3};
 static final int[] EMPTY={R.id.empty0,R.id.empty1,R.id.empty2,R.id.empty3};
 static final int[] HEADS={R.id.head0,R.id.head1,R.id.head2,R.id.head3};
 static final int[] ADDS={R.id.add0,R.id.add1,R.id.add2,R.id.add3};
 static final String[] LABELS={"重要 · 紧急","重要 · 不紧急","不重要 · 紧急","不重要 · 不紧急"};

 static List<JSONObject> tasks(Context c) throws Exception {
  List<JSONObject> result=new ArrayList<>();
  if(AppLock.enabled(c))return result;
  JSONArray items=new JSONObject(Store.read(c)).getJSONArray("items");
  for(int n=0;n<items.length();n++){
   JSONObject t=items.getJSONObject(n);
   if(!t.optBoolean("done")&&!t.optBoolean("deleted")&&!t.optBoolean("purged")&&!"note".equals(t.optString("kind")))result.add(t);
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
   RemoteViews v=new RemoteViews(c.getPackageName(),R.layout.quadrant_widget);
   v.setTextViewText(R.id.widget_date,new SimpleDateFormat("M月d日 E",Locale.CHINA).format(new Date())+(locked||failed?"":" · "+tasks.size()+" 项待办"));
   v.setViewVisibility(R.id.widget_matrix,locked||failed?View.GONE:View.VISIBLE);
   v.setViewVisibility(R.id.widget_notice,locked||failed?View.VISIBLE:View.GONE);
   v.setTextViewText(R.id.widget_notice,locked?"应用密码保护已开启\n点此进入应用查看事项":"暂时无法读取事项\n点此进入应用检查");
   v.setOnClickPendingIntent(R.id.widget_notice,open(c,-1,false));
   v.setOnClickPendingIntent(R.id.widget_title,open(c,-1,false));
   v.setTextViewText(R.id.widget_hint,locked?"为保护隐私，桌面不展示事项内容":"各象限可上下滑动 · 点标题展开 · ＋新增");
   Intent refresh=new Intent(c,QuadrantWidget.class).setAction(REFRESH);
   v.setOnClickPendingIntent(R.id.widget_refresh,PendingIntent.getBroadcast(c,200,refresh,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
   for(int q=0;q<4;q++){
    v.setTextViewText(HEADS[q],LABELS[q]+"\n"+counts[q]+" 项");
    v.setOnClickPendingIntent(HEADS[q],open(c,q,false));
    v.setOnClickPendingIntent(ADDS[q],open(c,q,true));
    v.setTextViewText(EMPTY[q],"暂无待办\n点 ＋ 添加");
    v.setOnClickPendingIntent(EMPTY[q],open(c,q,true));
    Intent adapter=new Intent(c,QuadrantWidgetService.class).putExtra("quadrant",q)
     .setData(Uri.parse("qingxiao://widget-list/"+id+"/"+q));
    v.setRemoteAdapter(LISTS[q],adapter);v.setEmptyView(LISTS[q],EMPTY[q]);
    // Collection rows supply itemId through a fill-in Intent. The component is explicit.
    v.setPendingIntentTemplate(LISTS[q],PendingIntent.getActivity(c,1000+id*4+q,target(c,q,false).setData(Uri.parse("qingxiao://widget-row/"+id+"/"+q)),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_MUTABLE));
   }
   manager.updateAppWidget(id,v);
   for(int list:LISTS)manager.notifyAppWidgetViewDataChanged(id,list);
  }
 }
 @Override public void onUpdate(Context c,AppWidgetManager m,int[] ids){update(c,m,ids);}
 @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options){update(c,m,new int[]{id});}
 @Override public void onReceive(Context c,Intent intent){super.onReceive(c,intent);String action=intent.getAction();if(REFRESH.equals(action)||Intent.ACTION_DATE_CHANGED.equals(action)||Intent.ACTION_TIME_CHANGED.equals(action)||Intent.ACTION_TIMEZONE_CHANGED.equals(action))refresh(c);}

 static void showSettings(Activity a){
  AppWidgetManager m=AppWidgetManager.getInstance(a);
  String help="在桌面直接查看四象限，每个象限可上下滑动。点事项查看详情，点 ＋ 在对应象限新增。\n\n长按桌面上的小组件可调整大小。应用保存或收到同步数据后会自动刷新；右上角 ↻ 重新读取本机数据。\n\n开启应用密码时，桌面会隐藏事项内容。";
  AlertDialog.Builder dialog=new AlertDialog.Builder(a).setTitle("四象限桌面小组件").setMessage(help).setNegativeButton("关闭",null);
  if(m.isRequestPinAppWidgetSupported())dialog.setPositiveButton("添加到桌面",(d,w)->{
   try{if(!m.requestPinAppWidget(new ComponentName(a,QuadrantWidget.class),null,null))manual(a);}catch(Exception e){manual(a);}
  });else dialog.setPositiveButton("查看添加方法",(d,w)->manual(a));
  dialog.show();
 }
 static void manual(Activity a){new AlertDialog.Builder(a).setTitle("添加到手机桌面").setMessage("回到桌面，长按空白处 → 添加小组件（或桌面工具）→ 找到「轻效 Todo / 四象限事项」→ 拖到空白桌面。\n\n部分手机可在小组件页面的「全部应用」或「安卓小部件」中找到。").setPositiveButton("知道了",null).show();}
}
