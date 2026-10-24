package cn.nemo.qingxiao;
import android.content.*;
public class BootReceiver extends BroadcastReceiver { public void onReceive(Context c,Intent i){QuadrantWidget.refresh(c);Reminders.sync(c);TimerEngine.restore(c);} }
