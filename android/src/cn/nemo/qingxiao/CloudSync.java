package cn.nemo.qingxiao;
import android.content.Context;
import android.security.keystore.*;
import android.util.Base64;
import org.json.*;
import java.io.*;
import java.net.*;
import javax.net.ssl.HttpsURLConnection;
import javax.crypto.*;
import javax.crypto.spec.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.MGF1ParameterSpec;

public class CloudSync {
 static final String ORIGIN="https://qingxiao-todo-nemo-20261021.civilaspen10.chatgpt.site";
 static final String ALIAS="qingxiao-cloud-v2";
 static KeyStore keyStore()throws Exception {KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);return ks;}
 public static void prepare(Context c)throws Exception {KeyStore ks=keyStore();if(!ks.containsAlias(ALIAS)){KeyPairGenerator gen=KeyPairGenerator.getInstance("RSA","AndroidKeyStore");gen.initialize(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_DECRYPT).setKeySize(2048).setDigests(KeyProperties.DIGEST_SHA256,KeyProperties.DIGEST_SHA1).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP).build());gen.generateKeyPair();ks=keyStore();}File pub=new File(c.getExternalFilesDir(null),"sync-public.pem");try(FileOutputStream out=new FileOutputStream(pub)){out.write(("-----BEGIN PUBLIC KEY-----\n"+Base64.encodeToString(ks.getCertificate(ALIAS).getPublicKey().getEncoded(),Base64.NO_WRAP)+"\n-----END PUBLIC KEY-----\n").getBytes(StandardCharsets.UTF_8));}load(c);}
 static JSONObject decrypt(String envelope)throws Exception {JSONObject e=new JSONObject(envelope);Cipher rsa=Cipher.getInstance("RSA/ECB/OAEPPadding");rsa.init(Cipher.DECRYPT_MODE,keyStore().getKey(ALIAS,null),new OAEPParameterSpec("SHA-256","MGF1",MGF1ParameterSpec.SHA1,PSource.PSpecified.DEFAULT));byte[] key=rsa.doFinal(Base64.decode(e.getString("key"),Base64.DEFAULT));Cipher aes=Cipher.getInstance("AES/GCM/NoPadding");aes.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,Base64.decode(e.getString("iv"),Base64.DEFAULT)));JSONObject config=new JSONObject(new String(aes.doFinal(Base64.decode(e.getString("data"),Base64.DEFAULT)),StandardCharsets.UTF_8));if(!ORIGIN.equals(config.getString("origin"))||config.optString("token").length()<20)throw new Exception("设备配置无效");return config;}
 static File privateFile(Context c){return new File(c.getNoBackupFilesDir(),"cloud-config.enc");}
 public static void load(Context c)throws Exception {File stage=new File(c.getExternalFilesDir(null),"sync-config.enc");if(stage.exists()){String encrypted=Store.stream(new FileInputStream(stage));decrypt(encrypted);android.util.AtomicFile f=new android.util.AtomicFile(privateFile(c));FileOutputStream out=f.startWrite();try{out.write(encrypted.getBytes(StandardCharsets.UTF_8));f.finishWrite(out);stage.delete();}catch(Exception e){f.failWrite(out);throw e;}}}
 static JSONObject config(Context c)throws Exception {return decrypt(Store.stream(new FileInputStream(privateFile(c))));}
 public static String status(Context c){try{config(c);return "已配置个人云空间";}catch(Exception e){return "未连接云空间";}}
 public static HttpsURLConnection connection(Context c,String path)throws Exception {if(!path.matches("/api/photos/photo-[a-zA-Z0-9-]{10,80}"))throw new Exception("照片路径无效");HttpsURLConnection conn=(HttpsURLConnection)new URL(ORIGIN+path).openConnection();conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(10000);conn.setReadTimeout(15000);conn.setRequestProperty("OAI-Sites-Authorization","Bearer "+config(c).getString("token"));return conn;}
 public static String sync(Context c,String body)throws Exception {JSONObject cf=config(c);HttpsURLConnection conn=(HttpsURLConnection)new URL(ORIGIN+"/api/state").openConnection();try{conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(10000);conn.setReadTimeout(15000);conn.setRequestMethod("POST");conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");conn.setRequestProperty("OAI-Sites-Authorization","Bearer "+cf.getString("token"));try(OutputStream out=conn.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}int code=conn.getResponseCode();if(code!=200)throw new Exception(code==401||code==403?"云空间登录已失效，请重新连接":"同步暂不可用（"+code+"），数据已保存在手机");String response=Store.stream(conn.getInputStream());JSONObject result=new JSONObject(response);if(!result.has("records"))throw new Exception("同步返回格式无效");return response;}finally{conn.disconnect();}}
}
