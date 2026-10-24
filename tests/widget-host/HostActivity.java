package cn.nemo.qingxiao.widgetqa;

import android.app.Activity;
import android.appwidget.*;
import android.content.*;
import android.os.*;
import android.util.SizeF;
import android.view.*;
import android.widget.*;
import java.util.*;

/** Separate emulator-only host. No hooks or exported test components in the shipping app. */
public class HostActivity extends Activity {
 AppWidgetHost host; AppWidgetHostView view; int id;
 @Override public void onCreate(Bundle state){super.onCreate(state);render();}
 @Override public void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);render();}
 void render(){
  if(!Build.FINGERPRINT.contains("generic")&&!Build.MODEL.contains("sdk"))throw new IllegalStateException("Use an isolated emulator");
  if(host!=null)host.stopListening();
  host=new AppWidgetHost(this,242);
  AppWidgetManager manager=AppWidgetManager.getInstance(this);
  id=getPreferences(0).getInt("id",-1);
  if(id<0||manager.getAppWidgetInfo(id)==null){
   id=host.allocateAppWidgetId();
   if(!manager.bindAppWidgetIdIfAllowed(id,new ComponentName("cn.nemo.qingxiao","cn.nemo.qingxiao.QuadrantWidget")))throw new IllegalStateException("Grant widget binding to this test host first");
   getPreferences(0).edit().putInt("id",id).apply();
  }
  int w=getIntent().getIntExtra("width",320),h=getIntent().getIntExtra("height",280);
  boolean legacy=getIntent().getBooleanExtra("legacy",false);
  Bundle options=new Bundle();
  options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,w);
  options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,w);
  options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,h);
  options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,h);
  if(Build.VERSION.SDK_INT>=31){
   ArrayList<SizeF> sizes=new ArrayList<>();
   if(!legacy){
    sizes.add(new SizeF(w,h));
    if(getIntent().getBooleanExtra("multiple",false))sizes.add(new SizeF(480,220));
   }
   options.putParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES,sizes);
  }
  manager.updateAppWidgetOptions(id,options);
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(8),dp(8),dp(8),dp(8));root.setBackgroundColor(0xffd8e5e9);
  TextView caption=new TextView(this);caption.setText(w+" × "+h+" dp · "+(legacy?"legacy options":"exact sizes")+" · font "+getResources().getConfiguration().fontScale);root.addView(caption);
  view=host.createView(this,id,manager.getAppWidgetInfo(id));view.setPadding(0,0,0,0);root.addView(view,new LinearLayout.LayoutParams(dp(w),dp(h)));
  TextView icons=new TextView(this);icons.setText("◉     ◉     ◉     ◉\n\nReserved space for app icons");icons.setTextSize(22);icons.setPadding(12,40,12,12);root.addView(icons);
  setContentView(root);host.startListening();
 }
 int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
 @Override public void onDestroy(){if(host!=null)host.stopListening();super.onDestroy();}
}
