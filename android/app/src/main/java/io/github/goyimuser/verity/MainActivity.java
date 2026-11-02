package io.github.goyimuser.verity;

import android.app.*;
import android.os.*;
import android.content.*;
import android.net.Uri;
import android.webkit.*;
import android.print.*;
import android.view.*;
import android.widget.*;
import com.chaquo.python.Python;
import java.io.*;
import java.net.URL;
import java.net.HttpURLConnection;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private WebView web;
    private String origin;
    private ValueCallback<Uri[]> chooser;
    private byte[] pendingExport;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private boolean local(String url) { return origin!=null && url.startsWith(origin+"/"); }
    private void error(String text) { runOnUiThread(()->{if(!isFinishing())new AlertDialog.Builder(this).setTitle("Verity").setMessage(text).setPositiveButton(android.R.string.ok,null).show();}); }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0);
        web=new WebView(this);
        web.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        setContentView(web);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.addJavascriptInterface(new Bridge(),"VerityAndroid");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) { return !local(request.getUrl().toString()); }
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params) {
                if(chooser!=null)chooser.onReceiveValue(null);
                chooser=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(intent,1);return true;
            }
        });
        web.setDownloadListener((url,userAgent,disposition,mime,size)->{
            if(!local(url))return;
            worker.execute(()->{
                try {
                    HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
                    c.setRequestProperty("Cookie",CookieManager.getInstance().getCookie(origin));
                    c.setConnectTimeout(15000);c.setReadTimeout(60000);
                    try(InputStream input=c.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){
                        byte[] buffer=new byte[8192];int count;
                        while((count=input.read(buffer))!=-1){output.write(buffer,0,count);if(output.size()>67108864)throw new IOException("File too large");}
                        save(output.toByteArray(),URLUtil.guessFileName(url,disposition,mime),mime);
                    }
                    finally{c.disconnect();}
                }catch(Exception e){error(e.getMessage());}
            });
        });
        worker.execute(()->{
            try {
                String url=Python.getInstance().getModule("android_host").callAttr("start",getFilesDir().getAbsolutePath()).toString();
                origin=url.substring(0,url.indexOf('/',7));
                runOnUiThread(()->web.loadUrl(url));
            }catch(Exception e){error(e.toString());}
        });
    }
    private void save(byte[] bytes,String name,String mime) {
        runOnUiThread(()->{
            if(pendingExport!=null){error("Finish saving the previous document first. / ابتدا ذخیره سند قبلی را تمام کنید.");return;}
            pendingExport=bytes;
            startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime==null?"application/octet-stream":mime.split(";")[0]).putExtra(Intent.EXTRA_TITLE,name),2);
        });
    }
    public class Bridge {
        @JavascriptInterface public void close() { runOnUiThread(()->finish()); }
        @JavascriptInterface public void saveFile(String base64,String name,String mime) {
            if(base64.length()>90000000){error("File too large / فایل بیش از حد بزرگ است");return;}
            save(android.util.Base64.decode(base64,android.util.Base64.DEFAULT),name,mime);
        }
        @JavascriptInterface public void printReport(String path) {
            if(!path.startsWith("/api/android/report?"))return;
            runOnUiThread(()->{
                WebView report=new WebView(MainActivity.this);
                report.getSettings().setJavaScriptEnabled(false);
                report.setWebViewClient(new WebViewClient(){
                    @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !local(r.getUrl().toString());}
                    @Override public void onPageFinished(WebView v,String url){
                        PrintManager manager=(PrintManager)getSystemService(PRINT_SERVICE);
                        manager.print("Verity",v.createPrintDocumentAdapter("Verity"),new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                    }
                });
                report.loadUrl(origin+path);
            });
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(request==1&&chooser!=null){chooser.onReceiveValue(result==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);chooser=null;}
        if(request==2){byte[] bytes=pendingExport;pendingExport=null;
            if(result==RESULT_OK&&data!=null&&bytes!=null)worker.execute(()->{try(OutputStream output=getContentResolver().openOutputStream(data.getData())){output.write(bytes);}catch(Exception e){error(e.getMessage());}});
        }
    }
    @Override public void onBackPressed(){web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.dispatchEvent(new Event('cancel',{cancelable:true}));return;} if(confirm(document.documentElement.lang==='fa'?'خروج از برنامه؟':'Close Verity?')) VerityAndroid.close();})()",null);}
    @Override protected void onDestroy(){if(chooser!=null)chooser.onReceiveValue(null);worker.shutdown();web.destroy();super.onDestroy();}
}
