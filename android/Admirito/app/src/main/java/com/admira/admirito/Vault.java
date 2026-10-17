package com.admira.admirito;
import android.content.Context;
import android.security.keystore.*;
import android.util.Base64;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.security.KeyStore;
import org.json.JSONObject;
/** Device credential encrypted with a non-exportable Android Keystore key. No backups. */
final class Vault {
 private final Context context;
 Vault(Context context){this.context=context;}
 private javax.crypto.SecretKey key() throws Exception {
  KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
  if(!store.containsAlias("admirito.device")){KeyGenerator g=KeyGenerator.getInstance("AES","AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder("admirito.device",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());g.generateKey();}
  return (javax.crypto.SecretKey)store.getKey("admirito.device",null);
 }
 void save(JSONObject value) throws Exception {Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());String data=Base64.encodeToString(c.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(c.doFinal(value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)),Base64.NO_WRAP);if(!context.getSharedPreferences("vault",0).edit().putString("device",data).commit())throw new Exception("credential_save_failed");}
 JSONObject load() throws Exception {String value=context.getSharedPreferences("vault",0).getString("device","");if(value.isEmpty())return new JSONObject();String[] p=value.split(":");Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(p[0],0)));return new JSONObject(new String(c.doFinal(Base64.decode(p[1],0)),java.nio.charset.StandardCharsets.UTF_8));}
 void clear(){context.getSharedPreferences("vault",0).edit().clear().commit();}
}
