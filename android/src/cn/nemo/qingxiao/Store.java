package cn.nemo.qingxiao;
import android.content.*;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class Store {
 public static String empty(){return "{\"format\":\"qingxiao-todo\",\"version\":1,\"items\":[],\"projects\":[],\"tags\":[]}";}
 public static synchronized String read(Context c) throws Exception {
  AtomicFile f=new AtomicFile(new File(c.getFilesDir(),"tasks.json"));
  try {return new String(f.readFully(),StandardCharsets.UTF_8);} catch(FileNotFoundException e){return empty();}
 }
 public static JSONObject validate(String s) throws Exception {
  if(s.length()>20*1024*1024)throw new Exception("文件超过20MB");
  JSONObject o=new JSONObject(s);
  if(!"qingxiao-todo".equals(o.optString("format"))||(o.optInt("version")!=1&&o.optInt("version")!=2&&o.optInt("version")!=3))throw new Exception("不是轻效Todo备份格式");
  JSONArray a=o.getJSONArray("items"); Set<String> ids=new HashSet<>();
  if(a.length()>50000)throw new Exception("记录数量过多");
  for(String field:new String[]{"projects","tags"}){
   if(o.has(field)&&!(o.get(field) instanceof JSONArray))throw new Exception("分类格式无效");
   JSONArray values=o.optJSONArray(field);if(values!=null)for(int i=0;i<values.length();i++)if(!(values.get(i) instanceof String))throw new Exception("分类必须是文字");
  }
  for(int i=0;i<a.length();i++){
   JSONObject t=a.getJSONObject(i); String id=t.getString("id");
   if(id.isEmpty()||!ids.add(id)||!(t.opt("title") instanceof String)||!(t.opt("notes") instanceof String))throw new Exception("条目格式或编号异常");
   if(t.has("parentId")&&!(t.get("parentId") instanceof String))throw new Exception("父任务编号无效");
   if(t.optInt("quadrant",-1)<0||t.optInt("quadrant",-1)>3)throw new Exception("四象限值无效");
   if(t.optLong("remindAt",0)<0||t.optLong("dueAt",0)<0)throw new Exception("日期无效");
   if(!t.optString("kind","task").equals("task")&&!t.optString("kind").equals("note"))throw new Exception("类型无效");
   for(String f:new String[]{"dueAt","remindAt","createdAt","updatedAt","completedAt","order"})if(t.has(f)&&!(t.get(f) instanceof Number))throw new Exception("时间格式无效");
   for(String f:new String[]{"done","deleted"})if(t.has(f)&&!(t.get(f) instanceof Boolean))throw new Exception("完成状态无效");
   if(t.has("project")&&!(t.get("project") instanceof String))throw new Exception("项目格式无效");
   if(t.has("tags")){JSONArray tags=t.getJSONArray("tags");for(int j=0;j<tags.length();j++)if(!(tags.get(j) instanceof String))throw new Exception("标签格式无效");}
   if(t.has("subtasks")){JSONArray sub=t.getJSONArray("subtasks");for(int j=0;j<sub.length();j++){JSONObject st=sub.getJSONObject(j);if(!(st.get("text") instanceof String)||!(st.get("done") instanceof Boolean))throw new Exception("步骤格式无效");for(String f:new String[]{"startAt","dueAt","remindAt"})if(st.has(f)&&(!(st.get(f) instanceof Number)||st.optLong(f)<0))throw new Exception("子任务日期无效");if(st.optLong("startAt")>0&&st.optLong("dueAt")>0&&st.optLong("dueAt")<st.optLong("startAt"))throw new Exception("子任务时间顺序错误");}}
   JSONArray photos=t.optJSONArray("photos");if(photos!=null){if(photos.length()>12)throw new Exception("每事项最多12张照片");for(int j=0;j<photos.length();j++)if(!Photos.valid(photos.getJSONObject(j).optString("id")))throw new Exception("照片编号无效");}
  }
  for(String array:new String[]{"sessions","catalogs","preferences"}){JSONArray records=o.optJSONArray(array);if(records==null)continue;for(int i=0;i<records.length();i++){JSONObject r=records.getJSONObject(i);String id=r.getString("id");if(id.isEmpty()||!ids.add(id))throw new Exception("记录编号重复");if("sessions".equals(array)){JSONArray seg=r.getJSONArray("segments");for(int j=0;j<seg.length();j++){JSONObject v=seg.getJSONObject(j);if(v.getLong("endAt")<v.getLong("startAt"))throw new Exception("时间段无效");}}}}
  return o;
 }
 public static synchronized void writeClient(Context c,String s) throws Exception {
  JSONObject candidate=validate(s); String old=read(c);
  // An alarm may finish while JavaScript is editing. Retain newly created native sessions.
  JSONArray previous=new JSONObject(old).optJSONArray("sessions"),incoming=candidate.optJSONArray("sessions");
  if(previous!=null){if(incoming==null){incoming=new JSONArray();candidate.put("sessions",incoming);}for(int i=0;i<previous.length();i++){JSONObject r=previous.getJSONObject(i);int match=-1;for(int j=0;j<incoming.length();j++)if(r.optString("id").equals(incoming.getJSONObject(j).optString("id"))){match=j;break;}if(match<0)incoming.put(r);else if(r.optLong("updatedAt")>incoming.getJSONObject(match).optLong("updatedAt")&&r.optBoolean("_dirty"))incoming.put(match,r);}}
  write(c,candidate.toString());
 }
 public static synchronized void write(Context c,String s) throws Exception {validate(s);String old=read(c);if(s.equals(old))return;
  if(new JSONObject(old).optInt("version")>=3&&new JSONObject(s).optInt("version")<3)throw new Exception("不能用旧格式覆盖多级任务，请先更新客户端");
  File migration=new File(c.getFilesDir(),"before-tree-v3.json");
  if(new JSONObject(old).optInt("version")<3&&new JSONObject(s).optInt("version")==3&&!migration.exists()){try(FileOutputStream backup=new FileOutputStream(migration)){backup.write(old.getBytes(StandardCharsets.UTF_8));backup.getFD().sync();}}
  File dir=new File(c.getFilesDir(),"snapshots");dir.mkdirs();
  File snap=new File(dir,System.currentTimeMillis()+".json");
  try(FileOutputStream out=new FileOutputStream(snap)){out.write(old.getBytes(StandardCharsets.UTF_8));out.getFD().sync();}
  AtomicFile f=new AtomicFile(new File(c.getFilesDir(),"tasks.json"));FileOutputStream out=null;
  try{out=f.startWrite();out.write(s.getBytes(StandardCharsets.UTF_8));f.finishWrite(out);}catch(Exception e){f.failWrite(out);throw e;}
  File[] files=dir.listFiles();if(files!=null){Arrays.sort(files,Comparator.comparing(File::getName));for(int i=0;i<files.length-20;i++)files[i].delete();}
  QuadrantWidget.refresh(c);
  Reminders.sync(c);
 }
 public static String stream(InputStream in) throws Exception {
  try(InputStream x=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){
   byte[] b=new byte[8192];int n;while((n=x.read(b))!=-1){out.write(b,0,n);if(out.size()>20*1024*1024)throw new Exception("文件超过20MB");}
   return new String(out.toByteArray(),StandardCharsets.UTF_8);
  }
 }
}
