package cn.nemo.qingxiao;
import android.app.job.*;import android.content.*;import android.util.Log;
public class SyncJob extends JobService {
 static void schedule(Context c){
  // Background sync is optional: scheduler restrictions must not block local startup.
  try {
   JobScheduler scheduler=c.getSystemService(JobScheduler.class);
   if(scheduler==null){Log.w("Qingxiao","Background sync scheduler unavailable");return;}
   int result=scheduler.schedule(new JobInfo.Builder(701,new ComponentName(c,SyncJob.class))
     .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setPeriodic(15*60000L).build());
   if(result!=JobScheduler.RESULT_SUCCESS)Log.w("Qingxiao","Background sync scheduling deferred");
  }catch(RuntimeException e){
   Log.w("Qingxiao","Background sync scheduling unavailable; local mode remains usable",e);
  }
 }
 public boolean onStartJob(JobParameters p){new Thread(()->{SyncEngine.run(this);jobFinished(p,false);}).start();return true;}
 public boolean onStopJob(JobParameters p){return true;}
}
