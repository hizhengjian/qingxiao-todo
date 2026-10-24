package cn.nemo.qingxiao;
import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
 public static volatile boolean foreground=false; WebView web; long backgroundAt=0; boolean unlocking=false; String pendingCsv; boolean pageReady=false; java.util.concurrent.ExecutorService syncExecutor=java.util.concurrent.Executors.newSingleThreadExecutor();
 public void onCreate(Bundle b){super.onCreate(b);SyncJob.schedule(this);try{CloudSync.prepare(this);}catch(Exception e){}TimerEngine.restore(this);
  getWindow().setStatusBarColor(Color.rgb(51,51,51));getWindow().setNavigationBarColor(Color.rgb(247,247,242));
  getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
  web=new WebView(this);setContentView(web);web.setBackgroundColor(Color.rgb(247,247,242));
  web.getSettings().setJavaScriptEnabled(true);web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);web.getSettings().setDomStorageEnabled(false);
  web.setWebChromeClient(new WebChromeClient(){
   public boolean onJsConfirm(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setTitle("轻效 Todo").setMessage(message).setPositiveButton("确定",(d,w)->result.confirm()).setNegativeButton("取消",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
   public boolean onJsAlert(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setTitle("轻效 Todo").setMessage(message).setPositiveButton("知道了",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;}
  });
  web.addJavascriptInterface(new Bridge(),"Native");
  web.setWebViewClient(new WebViewClient(){
   public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){return true;}
   public void onPageFinished(WebView w,String u){pageReady=true;handleIntent();}
  });
  try{web.loadDataWithBaseURL("https://qingxiao.local/",Store.stream(getAssets().open("index.html")),"text/html","UTF-8",null);}catch(Exception e){new AlertDialog.Builder(this).setMessage("启动失败："+e.getMessage()).show();}
 }
 void handleIntent(){if(!pageReady)return;Intent intent=getIntent();String id=intent.getStringExtra("itemId"),sid=intent.getStringExtra("subtaskId");if(intent.getBooleanExtra("review",false))web.evaluateJavascript("go(\"timesheet\")",null);if(intent.getBooleanExtra("focus",false))web.evaluateJavascript("go(\"pomodoro\")",null);if(id!=null)web.evaluateJavascript("openItem("+JSONObject.quote(id)+","+JSONObject.quote(sid==null?"":sid)+")",null);intent.removeExtra("itemId");intent.removeExtra("subtaskId");intent.removeExtra("review");intent.removeExtra("focus");}
 protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handleIntent();}
 protected void onPause(){super.onPause();foreground=false;backgroundAt=System.currentTimeMillis();}
 protected void onResume(){super.onResume();foreground=true;if(AppLock.enabled(this)&&!unlocking&&(backgroundAt==0||System.currentTimeMillis()-backgroundAt>60000)){unlocking=true;web.setVisibility(android.view.View.INVISIBLE);AppLock.unlock(this,()->{unlocking=false;web.setVisibility(android.view.View.VISIBLE);});}Reminders.sync(this);TimerEngine.restore(this);}
 public void onBackPressed(){web.evaluateJavascript("handleBack()",v->{if(!"true".equals(v))MainActivity.super.onBackPressed();});}
 void callback(String fn,String data){runOnUiThread(()->web.evaluateJavascript(fn+"("+JSONObject.quote(data)+")",null));}
 class Bridge {
  @JavascriptInterface public void haptic(String kind){runOnUiThread(()->web.performHapticFeedback("hold".equals(kind)?android.view.HapticFeedbackConstants.LONG_PRESS:android.view.HapticFeedbackConstants.CLOCK_TICK));}
  @JavascriptInterface public void pickPhoto(){runOnUiThread(()->{try{startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE),13);}catch(Exception e){callback("toast","手机没有可用的相册选择器");}});}
  @JavascriptInterface public String readPhoto(String id){return Photos.read(MainActivity.this,id);}
  @JavascriptInterface public void requestPhotos(String ids){syncExecutor.execute(()->{try{Photos.sync(MainActivity.this,new JSONArray(ids));callback("onNativePhotos","{}");}catch(Exception e){callback("onNativePhotos","{\"error\":"+JSONObject.quote(e.getMessage())+"}");}});}
  @JavascriptInterface public void addCalendarEvent(String json){runOnUiThread(()->{try{JSONObject e=new JSONObject(json);Intent i=new Intent(Intent.ACTION_INSERT).setData(android.provider.CalendarContract.Events.CONTENT_URI).putExtra(android.provider.CalendarContract.Events.TITLE,e.getString("title")).putExtra(android.provider.CalendarContract.Events.DESCRIPTION,e.optString("description")).putExtra(android.provider.CalendarContract.Events.EVENT_LOCATION,e.optString("location")).putExtra(android.provider.CalendarContract.EXTRA_EVENT_BEGIN_TIME,e.getLong("startAt")).putExtra(android.provider.CalendarContract.EXTRA_EVENT_END_TIME,e.getLong("endAt")).putExtra(android.provider.CalendarContract.EXTRA_EVENT_ALL_DAY,e.optBoolean("allDay"));startActivity(i);}catch(ActivityNotFoundException e){callback("toast","没有找到日历应用；日程已保存在轻效Todo日历");}catch(Exception e){callback("toast","日程时间不完整");}});}

  @JavascriptInterface public String lockStatus(){return AppLock.enabled(MainActivity.this)?"应用密码已开启":"应用密码未开启";}
  @JavascriptInterface public void appLockSettings(){runOnUiThread(()->AppLock.settings(MainActivity.this));}
  @JavascriptInterface public String timerState(){try{return TimerEngine.state(MainActivity.this).toString();}catch(Exception e){return "{\"error\":\"计时状态读取失败\"}";}}
  @JavascriptInterface public String timerAction(String action,String payload){try{return TimerEngine.action(MainActivity.this,action,new JSONObject(payload)).toString();}catch(Exception e){return "{\"error\":"+JSONObject.quote(e.getMessage())+"}";}}
  @JavascriptInterface public String syncStatus(){return CloudSync.status(MainActivity.this);}
  @JavascriptInterface public void loadEncryptedConfig(){try{CloudSync.load(MainActivity.this);}catch(Exception e){callback("toast","同步配置读取失败");}}
  @JavascriptInterface public void requestSync(String payload){syncExecutor.execute(()->{String result;try{result=CloudSync.sync(MainActivity.this,payload);}catch(Exception e){result="{\"error\":"+JSONObject.quote(e.getMessage()==null?"同步失败，修改已保存在本机":e.getMessage())+"}";}callback("onNativeSync",result);});}
  @JavascriptInterface public void exportCsv(String csv){pendingCsv=csv;runOnUiThread(()->startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("text/csv").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"番茄时间表.csv"),12));}

  @JavascriptInterface public String load(){try{TimerEngine.state(MainActivity.this);return Store.read(MainActivity.this);}catch(Exception e){return "{\"error\":\"读取失败，请保留现场并恢复备份\"}";}}
  @JavascriptInterface public String save(String s){try{Store.writeClient(MainActivity.this,s);return "ok";}catch(Exception e){return "保存失败："+e.getMessage();}}
  @JavascriptInterface public void exportData(){runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"轻效Todo-"+new java.text.SimpleDateFormat("yyyyMMdd-HHmm").format(new java.util.Date())+".json");startActivityForResult(i,10);});}
  @JavascriptInterface public void importData(){runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,11);});}
  @JavascriptInterface public String reminderStatus(){
   boolean notify=Build.VERSION.SDK_INT<33||checkSelfPermission("android.permission.POST_NOTIFICATIONS")==android.content.pm.PackageManager.PERMISSION_GRANTED;
   boolean exact=Build.VERSION.SDK_INT<31||getSystemService(AlarmManager.class).canScheduleExactAlarms();
   return notify?(exact?"通知与精确提醒已开启":"通知已开启；精确提醒未开启，可能延迟"):"通知未开启";
  }
  @JavascriptInterface public void permissions(){runOnUiThread(()->{
   if(Build.VERSION.SDK_INT>=33&&checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},1);
   else if(Build.VERSION.SDK_INT>=31&&!getSystemService(AlarmManager.class).canScheduleExactAlarms())startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));
   else startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()));
  });}
 }
 protected void onActivityResult(int req,int res,Intent data){super.onActivityResult(req,res,data);if(res!=RESULT_OK||data==null)return;
  try{
   if(req==13){Uri photo=data.getData();syncExecutor.execute(()->{try{callback("onNativePhoto",Photos.add(MainActivity.this,photo).toString());}catch(Exception e){callback("onNativePhoto","{\"error\":"+JSONObject.quote(e.getMessage())+"}");}});return;}
   if(req==10){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(Store.read(this).getBytes(StandardCharsets.UTF_8));}callback("toast","备份已保存");}
   if(req==12&&pendingCsv!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(pendingCsv.getBytes(StandardCharsets.UTF_8));}pendingCsv=null;callback("toast","时间明细已导出");}
   if(req==11){String s=Store.stream(getContentResolver().openInputStream(data.getData()));Store.validate(s);callback("previewImport",s);}
  }catch(Exception e){callback("toast","操作失败："+e.getMessage());}
 }
}
