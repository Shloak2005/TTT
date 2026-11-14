package com.f1championship.tracker;

import android.app.Activity;
import android.os.Bundle;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Rect;
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

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent intent) {
        super.onActivityResult(requestCode, resultCode, intent);
        if (requestCode == PICK_SCREENSHOT) {
            if (resultCode != RESULT_OK || intent == null || intent.getData() == null) {
                sendToPage("onOCRCancelled", ""); return;
            }
            try {
                InputImage image = InputImage.fromFilePath(this, intent.getData());
                recognizer.process(image)
                    .addOnSuccessListener(result -> {
                        try {
                            JSONArray lines = new JSONArray();
                            for (Text.TextBlock block : result.getTextBlocks()) {
                                for (Text.Line line : block.getLines()) {
                                    Rect r = line.getBoundingBox();
                                    if (r == null) continue;
                                    JSONObject row = new JSONObject();
                                    row.put("text", line.getText());
                                    row.put("x", r.left);
                                    row.put("y", r.top);
                                    row.put("w", r.width());
                                    row.put("h", r.height());
                                    lines.put(row);
                                }
                            }
                            JSONObject payload = new JSONObject();
                            payload.put("lines", lines);
                            payload.put("width", image.getWidth());
                            payload.put("height", image.getHeight());
                            sendToPage("onOCRSuccess", payload.toString());
                        } catch (Exception e) { sendToPage("onOCRFailure", e.getMessage()); }
                    })
                    .addOnFailureListener(e -> sendToPage("onOCRFailure", "OCR failed: " + e.getMessage()));
            } catch (Exception e) { sendToPage("onOCRFailure", "Could not read image: " + e.getMessage()); }
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