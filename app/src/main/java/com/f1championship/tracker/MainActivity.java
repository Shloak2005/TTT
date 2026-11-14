package com.f1championship.tracker;

import android.app.Activity;
import android.os.Bundle;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.widget.Toast;

import com.google.android.gms.tasks.Task;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int PICK_SCREENSHOT = 100;
    private static final int EXPORT_CSV = 101;
    private WebView browser;
    private TextRecognizer recognizer;
    private String exportContent = "";
    private SharedPreferences storage;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(10, 12, 18));
        getWindow().setNavigationBarColor(Color.rgb(10, 12, 18));
        storage = getSharedPreferences("f1_championship_state", Context.MODE_PRIVATE);
        recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        browser = new WebView(this);
        browser.setBackgroundColor(Color.rgb(10, 12, 18));
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setDomStorageEnabled(true);
        browser.getSettings().setAllowFileAccess(true);
        browser.getSettings().setAllowFileAccessFromFileURLs(false);
        browser.getSettings().setAllowUniversalAccessFromFileURLs(false);
        browser.getSettings().setBuiltInZoomControls(false);
        browser.getSettings().setDisplayZoomControls(false);
        browser.addJavascriptInterface(new AppBridge(), "F1Native");
        browser.setWebChromeClient(new WebChromeClient());
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme()) && "/android_asset/index.html".equals(u.getPath())) return false;
                if ("https".equals(u.getScheme())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                }
                return true;
            }
        });
        setContentView(browser);
        browser.loadUrl("file:///android_asset/index.html");
    }

    private void sendToPage(String event, String argument) {
        runOnUiThread(() -> {
            if (browser != null) browser.evaluateJavascript(
                "window." + event + "(" + JSONObject.quote(argument) + ")", null);
        });
    }

    public final class AppBridge {
        @JavascriptInterface public String loadState() {
            return storage.getString("state", "");
        }
        @JavascriptInterface public void saveState(String json) {
            if (json != null && json.length() < 1000000) storage.edit().putString("state", json).apply();
        }
        @JavascriptInterface public void scanScreenshot() {
            runOnUiThread(() -> {
                try {
                    Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                    pick.setType("image/*");
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(Intent.createChooser(pick, "Select F1 results screenshot"), PICK_SCREENSHOT);
                } catch (Exception e) { sendToPage("onOCRFailure", "Unable to open image picker: " + e.getMessage()); }
            });
        }
        @JavascriptInterface public void exportCsv(String name, String csv) {
            runOnUiThread(() -> {
                exportContent = csv == null ? "" : csv;
                try {
                    Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    create.setType("text/csv");
                    create.addCategory(Intent.CATEGORY_OPENABLE);
                    create.putExtra(Intent.EXTRA_TITLE, name == null ? "F1_standings.csv" : name);
                    startActivityForResult(create, EXPORT_CSV);
                } catch (Exception e) { Toast.makeText(MainActivity.this, "Export unavailable", Toast.LENGTH_LONG).show(); }
            });
        }
    }

    // Original + enhanced focused scan. The second pass crops out the bright wall/
    // keyboard around a photographed display, enlarges the game UI, and strengthens
    // the white-on-dark text. Both passes are parsed together in JavaScript, with
    // geometry preserved separately for each image coordinate system.
    private JSONObject serialisePass(Text scan, String variant, int width, int height) throws Exception {
        JSONArray lines = new JSONArray();
        for (Text.TextBlock block : scan.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                Rect rect = line.getBoundingBox();
                if (rect == null || line.getText() == null) continue;
                JSONObject row = rectJSON(line.getText(), rect);
                JSONArray elements = new JSONArray();
                for (Text.Element e : line.getElements()) {
                    Rect er = e.getBoundingBox();
                    if (er != null) elements.put(rectJSON(e.getText(), er));
                }
                row.put("elements", elements);
                lines.put(row);
            }
        }
        JSONObject pass = new JSONObject();
        pass.put("variant", variant);
        pass.put("lines", lines);
        pass.put("width", width);
        pass.put("height", height);
        return pass;
    }

    private JSONObject rectJSON(String text, Rect rect) throws Exception {
        JSONObject json = new JSONObject();
        json.put("text", text);
        json.put("x", rect.left);
        json.put("y", rect.top);
        json.put("w", rect.width());
        json.put("h", rect.height());
        return json;
    }

    private void finishScan(JSONArray passes) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("passes", passes);
            sendToPage("onOCRSuccess", payload.toString());
        } catch (Exception e) { sendToPage("onOCRFailure", "Could not return recognized text: " + e.getMessage()); }
    }

    private Bitmap decodePhoto(Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("Image unavailable");
            BitmapFactory.decodeStream(in, null, bounds);
        }
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        int largest = Math.max(bounds.outWidth, bounds.outHeight);
        opts.inSampleSize = 1;
        while(largest / opts.inSampleSize > 2600) opts.inSampleSize *= 2;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("Could not reopen photo");
            Bitmap source = BitmapFactory.decodeStream(in, null, opts);
            if (source == null) throw new IllegalStateException("Bitmap decoder returned no image");
            return source;
        }
    }

    private int luminance(int c) {
        return (Color.red(c) * 77 + Color.green(c) * 150 + Color.blue(c) * 29) >> 8;
    }

    // Detect the long dark results panel, while avoiding the sky, wall and keyboard.
    // For clean screenshots without a distinct dark panel, enhance the whole image.
    private Rect findScoreboard(Bitmap bitmap) {
        int w=bitmap.getWidth(),h=bitmap.getHeight();
        if(w<200 || h<150) return new Rect(0,0,w,h);
        int begin=(int)(h*.07f),end=(int)(h*.88f);
        int longest=0, bestStart=-1, bestEnd=-1;
        int runStart=-1;
        int step=Math.max(2,h/450);
        for(int y=begin;y<end;y+=step) {
            int dark=0;
            for(int j=0;j<29;j++) {
                int x=(int)(w*(.08f+.84f*j/28f));
                if(luminance(bitmap.getPixel(Math.min(w-1,x),y)) < 118)dark++;
            }
            boolean inBoard=dark>=19;
            if(inBoard && runStart<0)runStart=y;
            if((!inBoard || y+step>=end) && runStart>=0) {
                int runEnd=inBoard?y+step:y;
                if(runEnd-runStart>longest){longest=runEnd-runStart;bestStart=runStart;bestEnd=runEnd;}
                runStart=-1;
            }
        }
        if(bestStart<0 || longest<h*.15f) return new Rect(0,0,w,h);
        int pad=Math.max(20,(int)(h*.025f));
        return new Rect(0,Math.max(0,bestStart-pad),w,Math.min(h,bestEnd+pad));
    }

    private Bitmap enhancedResultsBitmap(Bitmap source) {
        Rect roi=findScoreboard(source);
        int cw=roi.width(),ch=roi.height();
        // Limit decoding and enhancement memory; no external OpenCV libraries needed.
        double scale=Math.max(1.0,Math.min(1.85,1800.0 / cw));
        scale=Math.min(scale,Math.sqrt(4000000.0 / (cw * (double)ch)));
        int dw=Math.max(1,(int)Math.round(cw*scale));
        int dh=Math.max(1,(int)Math.round(ch*scale));
        Bitmap target=Bitmap.createBitmap(dw,dh,Bitmap.Config.ARGB_8888);
        Canvas canvas=new Canvas(target);
        Paint p=new Paint(Paint.FILTER_BITMAP_FLAG|Paint.ANTI_ALIAS_FLAG);
        // Keep color information: fluorescent position text and flags remain legible.
        float contrast=1.27f, offset=-21f;
        ColorMatrix matrix=new ColorMatrix(new float[]{
            contrast,0,0,0,offset, 0,contrast,0,0,offset,
            0,0,contrast,0,offset, 0,0,0,1,0
        });
        p.setColorFilter(new ColorMatrixColorFilter(matrix));
        canvas.drawBitmap(source,roi,new Rect(0,0,dw,dh),p);
        return target;
    }

    private void scanPhoto(Uri uri) {
        try {
            InputImage original=InputImage.fromFilePath(this,uri);
            recognizer.process(original).addOnSuccessListener(first -> {
                JSONArray passes=new JSONArray();
                try {passes.put(serialisePass(first,"original",original.getWidth(),original.getHeight()));}
                catch (Exception e) {sendToPage("onOCRFailure",e.getMessage());return;}
                Bitmap source=null;
                Bitmap enhanced=null;
                try {
                    source=decodePhoto(uri);
                    enhanced=enhancedResultsBitmap(source);
                    if(source!=enhanced)source.recycle();
                    final Bitmap done=enhanced;
                    recognizer.process(InputImage.fromBitmap(done,0))
                        .addOnSuccessListener(second -> {
                            try {passes.put(serialisePass(second,"enhanced",done.getWidth(),done.getHeight()));}
                            catch(Exception ignored) { /* original pass still available */ }
                            finishScan(passes);
                            done.recycle();
                        })
                        .addOnFailureListener(e -> {finishScan(passes);done.recycle();});
                } catch (Exception ignored) {
                    if(enhanced!=null)enhanced.recycle();
                    if(source!=null && source!=enhanced && !source.isRecycled())source.recycle();
                    finishScan(passes);
                }
            }).addOnFailureListener(e -> sendToPage("onOCRFailure", "OCR could not scan this photo: " + e.getMessage()));
        } catch (Exception e) {sendToPage("onOCRFailure", "Could not open this image: " + e.getMessage());}
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent intent) {
        super.onActivityResult(requestCode, resultCode, intent);
        if (requestCode == PICK_SCREENSHOT) {
            if (resultCode != RESULT_OK || intent == null || intent.getData() == null) {
                sendToPage("onOCRCancelled", ""); return;
            }
            scanPhoto(intent.getData());
        }
        if (requestCode == EXPORT_CSV && resultCode == RESULT_OK && intent != null && intent.getData() != null) {
            try (OutputStream stream = getContentResolver().openOutputStream(intent.getData())) {
                if (stream == null) throw new IllegalStateException("No output stream");
                stream.write(exportContent.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "CSV saved", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Export failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override protected void onDestroy() {
        if (recognizer != null) recognizer.close();
        if (browser != null) browser.destroy();
        super.onDestroy();
    }
}