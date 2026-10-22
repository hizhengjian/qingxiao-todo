package cn.nemo.qingxiao;
import android.content.*;
import org.json.*;
public class TimerReceiver extends BroadcastReceiver {public void onReceive(Context c,Intent i){try{String action=i.getAction();if("expire".equals(action))TimerEngine.restore(c);else TimerEngine.action(c,action,new JSONObject());if("expire".equals(action)){final PendingResult result=goAsync();new Thread(()->{try{SyncEngine.run(c);}finally{result.finish();}}).start();}}catch(Exception e){android.util.Log.e("Qingxiao","Timer action failed");}}}
