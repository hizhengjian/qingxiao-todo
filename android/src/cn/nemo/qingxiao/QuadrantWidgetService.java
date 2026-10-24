package cn.nemo.qingxiao;

import android.content.*;
import android.view.View;
import android.widget.*;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;

public class QuadrantWidgetService extends RemoteViewsService {
 @Override public RemoteViewsFactory onGetViewFactory(Intent intent){return new Factory(getApplicationContext(),intent.getIntExtra("quadrant",0),intent.getBooleanExtra("expanded",false));}
 static class Factory implements RemoteViewsFactory {
  final Context c;final int quadrant;final boolean expanded;List<JSONObject> rows=new ArrayList<>();
  Factory(Context context,int q,boolean full){c=context;quadrant=q;expanded=full;}
  public void onCreate(){onDataSetChanged();}
  public synchronized void onDataSetChanged(){rows=new ArrayList<>();try{for(JSONObject t:QuadrantWidget.tasks(c))if(t.optInt("quadrant")==quadrant)rows.add(t);}catch(Exception e){/* Provider shows the read-error state. */}}
  public synchronized void onDestroy(){rows.clear();}
  public synchronized int getCount(){return AppLock.enabled(c)?0:rows.size();}
  public synchronized RemoteViews getViewAt(int position){
   RemoteViews v=new RemoteViews(c.getPackageName(),R.layout.widget_task);
   if(AppLock.enabled(c)||position<0||position>=rows.size()){v.setTextViewText(R.id.task_title,"");v.setViewVisibility(R.id.task_meta,View.GONE);return v;}
   JSONObject t=rows.get(position);String title=t.optString("title");
   // Avoid an oversized Binder parcel from a very long task title or project name.
   v.setTextViewText(R.id.task_title,"○  "+clip(title,expanded?1024:240));
   v.setInt(R.id.task_title,"setMaxLines",expanded?20:3);
   v.setInt(R.id.task_meta,"setMaxLines",expanded?2:1);
   List<String> meta=new ArrayList<>();long due=t.optLong("dueAt");
   if(due>0)meta.add((due<System.currentTimeMillis()?"逾期 · ":"")+new SimpleDateFormat(t.optBoolean("allDay")?"M/d":"M/d HH:mm",Locale.CHINA).format(new Date(due)));
   JSONArray subs=t.optJSONArray("subtasks");if(subs!=null&&subs.length()>0){int done=0;for(int i=0;i<subs.length();i++)if(subs.optJSONObject(i)!=null&&subs.optJSONObject(i).optBoolean("done"))done++;meta.add("子任务 "+done+"/"+subs.length());}
   if(!t.optString("project").isEmpty())meta.add(clip(t.optString("project"),40));
   v.setTextViewText(R.id.task_meta,String.join(" · ",meta));v.setViewVisibility(R.id.task_meta,meta.isEmpty()?View.GONE:View.VISIBLE);
   v.setTextColor(R.id.task_meta,due>0&&due<System.currentTimeMillis()?0xffa1352a:0xff596461);
   v.setContentDescription(R.id.task_row,clip(title,160)+(meta.isEmpty()?"":"，"+String.join("，",meta)));
   v.setOnClickFillInIntent(R.id.task_row,new Intent().putExtra("itemId",t.optString("id")));
   return v;
  }
  static String clip(String value,int length){return value.length()>length?value.substring(0,length)+"…":value;}
  public RemoteViews getLoadingView(){RemoteViews v=new RemoteViews(c.getPackageName(),R.layout.widget_task);v.setTextViewText(R.id.task_title,"读取中…");v.setViewVisibility(R.id.task_meta,View.GONE);return v;}
  public int getViewTypeCount(){return 1;}
  public long getItemId(int position){return position;}
  public boolean hasStableIds(){return false;}
 }
}
