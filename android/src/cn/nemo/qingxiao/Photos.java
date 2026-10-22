package cn.nemo.qingxiao;
import android.content.*;
import android.net.Uri;
import android.graphics.*;
import android.media.ExifInterface;
import android.util.*;
import org.json.*;
import java.io.*;
import javax.net.ssl.HttpsURLConnection;
public class Photos {
 static boolean valid(String id){return id!=null&&id.matches("photo-[a-zA-Z0-9-]{10,80}");}
 static File file(Context c,String id)throws Exception{if(!valid(id))throw new Exception("照片编号无效");File dir=new File(c.getFilesDir(),"photos");dir.mkdirs();return new File(dir,id+".jpg");}
 static void write(File target,byte[] bytes)throws Exception{AtomicFile atomic=new AtomicFile(target);FileOutputStream out=atomic.startWrite();try{out.write(bytes);atomic.finishWrite(out);}catch(Exception e){atomic.failWrite(out);throw e;}}
 static byte[] bytes(InputStream input,int max)throws Exception{try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){out.write(buf,0,n);if(out.size()>max)throw new Exception("照片过大");}return out.toByteArray();}}
 public static JSONObject add(Context c,Uri uri)throws Exception{
  if(uri==null||!"content".equals(uri.getScheme()))throw new Exception("请选择相册中的照片");
  byte[] raw=bytes(c.getContentResolver().openInputStream(uri),30*1024*1024);BitmapFactory.Options opt=new BitmapFactory.Options();opt.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(raw,0,raw.length,opt);if(opt.outWidth<=0||opt.outHeight<=0)throw new Exception("无法读取这张照片");opt.inSampleSize=1;while(Math.max(opt.outWidth,opt.outHeight)/opt.inSampleSize>2000)opt.inSampleSize*=2;opt.inJustDecodeBounds=false;Bitmap bitmap=BitmapFactory.decodeByteArray(raw,0,raw.length,opt);if(bitmap==null)throw new Exception("照片格式不支持");
  Matrix matrix=new Matrix();try{ExifInterface exif=new ExifInterface(new ByteArrayInputStream(raw));int orientation=exif.getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);switch(orientation){case 2:matrix.setScale(-1,1);break;case 3:matrix.setRotate(180);break;case 4:matrix.setScale(1,-1);break;case 5:matrix.setRotate(90);matrix.postScale(-1,1);break;case 6:matrix.setRotate(90);break;case 7:matrix.setRotate(-90);matrix.postScale(-1,1);break;case 8:matrix.setRotate(-90);break;}}catch(Exception ignored){}
  float scale=Math.min(1f,1600f/Math.max(bitmap.getWidth(),bitmap.getHeight()));matrix.postScale(scale,scale);Bitmap normalized=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),matrix,true);ByteArrayOutputStream out=new ByteArrayOutputStream();normalized.compress(Bitmap.CompressFormat.JPEG,80,out);if(normalized!=bitmap)normalized.recycle();bitmap.recycle();byte[] compressed=out.toByteArray();if(compressed.length>1500000)throw new Exception("压缩后的照片仍超过1.5MB");String id="photo-"+java.util.UUID.randomUUID();write(file(c,id),compressed);return new JSONObject().put("id",id).put("name","事项照片").put("size",compressed.length);
 }
 public static String read(Context c,String id){try{File f=file(c,id);return f.exists()?Base64.encodeToString(bytes(new FileInputStream(f),1500000),Base64.NO_WRAP):"";}catch(Exception e){return "";}}
 public static void sync(Context c,JSONArray ids)throws Exception{for(int i=0;i<ids.length();i++){String id=ids.getString(i);File f=file(c,id),mark=new File(f.getPath()+".uploaded");if(f.exists()&&mark.exists())continue;boolean upload=f.exists();HttpsURLConnection conn=CloudSync.connection(c,"/api/photos/"+id);try{if(upload){conn.setRequestMethod("PUT");conn.setDoOutput(true);conn.setRequestProperty("Content-Type","image/jpeg");try(OutputStream out=conn.getOutputStream();InputStream in=new FileInputStream(f)){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}}int status=conn.getResponseCode();if(status!=200)throw new Exception(upload?"照片待上传，请联网后重试":"照片待下载，请确认上传设备已同步");if(!upload){byte[] b=bytes(conn.getInputStream(),1500000);if(b.length<3||(b[0]&255)!=255||(b[1]&255)!=216)throw new Exception("照片响应无效");write(f,b);}mark.createNewFile();}finally{conn.disconnect();}}}
 public static JSONArray ids(Context c)throws Exception{JSONArray items=new JSONObject(Store.read(c)).getJSONArray("items"),ids=new JSONArray();java.util.HashSet<String> seen=new java.util.HashSet<>();for(int i=0;i<items.length();i++){JSONObject item=items.getJSONObject(i);if(item.optBoolean("purged"))continue;JSONArray photos=item.optJSONArray("photos");if(photos!=null)for(int j=0;j<photos.length();j++){String id=photos.getJSONObject(j).getString("id");if(seen.add(id))ids.put(id);}}return ids;}
}
