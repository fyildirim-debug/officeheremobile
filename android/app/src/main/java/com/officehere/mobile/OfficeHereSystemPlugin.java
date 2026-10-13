package com.officehere.mobile;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Yazdırma ve pano.
 *
 * Yazdırma: web tarafı yazdırma kökünü (yalnız @media print'te görünen sayfa kopyaları) kurar,
 * sonra print() çağrılır. WebView'in kendi yazdırma bağdaştırıcısı sistem yazdırma iletişim
 * kutusuyla açılır; kullanıcı yazıcı ya da "PDF olarak kaydet"i seçer. İş bitince (ya da
 * vazgeçilince, onFinish) çağrı çözülür ve web tarafı yazdırma kökünü kaldırır.
 *
 * Pano: WebView'de panodan okuma izni verilmediği için metin (ve varsa HTML) yerel olarak
 * okunur/yazılır; diğer uygulamalarla kopyala-yapıştır çalışır.
 */
@CapacitorPlugin(name = "OfficeHereSystem")
public class OfficeHereSystemPlugin extends Plugin {

    /** 1 inç = 1000 mil. */
    private static final int MILS = 1000;

    @PluginMethod
    public void print(PluginCall call) {
        final String name = safeJobName(call.getString("name", "OfficeHere"));
        final Double width = call.getDouble("width");
        final Double height = call.getDouble("height");
        getBridge().executeOnMainThread(() -> {
            WebView webView = getBridge().getWebView();
            // PrintManager yalnız etkinlik bağlamından yazdırır ("Can print only from an activity").
            Activity activity = getActivity();
            PrintManager pm = activity != null ? (PrintManager) activity.getSystemService(Context.PRINT_SERVICE) : null;
            if (webView == null || pm == null) {
                call.reject("Yazdırma bu cihazda kullanılamıyor.", "UNSUPPORTED");
                return;
            }
            PrintDocumentAdapter inner = webView.createPrintDocumentAdapter(name);
            PrintAttributes.Builder attrs = new PrintAttributes.Builder().setMinMargins(PrintAttributes.Margins.NO_MARGINS);
            if (width != null && height != null && width > 0 && height > 0) {
                attrs.setMediaSize(mediaFor(width, height));
            }
            try {
                pm.print(name, new Finishing(inner, call), attrs.build());
            } catch (RuntimeException e) {
                call.reject("Yazdırma başlatılamadı: " + e.getMessage(), "IO", e);
            }
        });
    }

    /** Sayfa boyutuna (inç) en yakın standart kâğıt; değilse özel boyut. Yatay sayfada döndürülür. */
    static PrintAttributes.MediaSize mediaFor(double widthIn, double heightIn) {
        int w = (int) Math.round(Math.min(widthIn, heightIn) * MILS);
        int h = (int) Math.round(Math.max(widthIn, heightIn) * MILS);
        PrintAttributes.MediaSize[] known = {
            PrintAttributes.MediaSize.ISO_A4,
            PrintAttributes.MediaSize.ISO_A3,
            PrintAttributes.MediaSize.ISO_A5,
            PrintAttributes.MediaSize.NA_LETTER,
            PrintAttributes.MediaSize.NA_LEGAL,
        };
        PrintAttributes.MediaSize media = null;
        for (PrintAttributes.MediaSize m : known) {
            if (Math.abs(m.getWidthMils() - w) <= 40 && Math.abs(m.getHeightMils() - h) <= 40) {
                media = m;
                break;
            }
        }
        if (media == null) media = new PrintAttributes.MediaSize("officehere_" + w + "x" + h, "Belge boyutu", w, h);
        return widthIn > heightIn ? media.asLandscape() : media;
    }

    private static String safeJobName(String name) {
        String s = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", " ").trim();
        return s.isEmpty() ? "OfficeHere" : s;
    }

    /** WebView bağdaştırıcısını sarar: iş bittiğinde çağrıyı çözer. */
    private static final class Finishing extends PrintDocumentAdapter {

        private final PrintDocumentAdapter inner;
        private PluginCall call;

        Finishing(PrintDocumentAdapter inner, PluginCall call) {
            this.inner = inner;
            this.call = call;
        }

        @Override
        public void onStart() {
            inner.onStart();
        }

        @Override
        public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal cancellationSignal, LayoutResultCallback callback, Bundle extras) {
            inner.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras);
        }

        @Override
        public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal cancellationSignal, WriteResultCallback callback) {
            inner.onWrite(pages, destination, cancellationSignal, callback);
        }

        @Override
        public void onFinish() {
            inner.onFinish();
            if (call != null) {
                call.resolve();
                call = null;
            }
        }
    }

    // ---- Pano ----

    @PluginMethod
    public void writeClipboard(PluginCall call) {
        final String text = call.getString("text", "");
        final String html = call.getString("html");
        getBridge().executeOnMainThread(() -> {
            ClipboardManager cm = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null) {
                call.reject("Pano kullanılamıyor.", "UNSUPPORTED");
                return;
            }
            ClipData clip = html != null && !html.isEmpty() ? ClipData.newHtmlText("OfficeHere", text, html) : ClipData.newPlainText("OfficeHere", text);
            cm.setPrimaryClip(clip);
            call.resolve();
        });
    }

    @PluginMethod
    public void readClipboard(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            ClipboardManager cm = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            JSObject out = new JSObject();
            ClipData clip = cm != null ? cm.getPrimaryClip() : null;
            if (clip == null || clip.getItemCount() == 0) {
                out.put("empty", true);
                call.resolve(out);
                return;
            }
            ClipData.Item item = clip.getItemAt(0);
            ClipDescription desc = clip.getDescription();
            CharSequence text = item.coerceToText(getContext());
            out.put("text", text != null ? text.toString() : "");
            if (desc != null && desc.hasMimeType(ClipDescription.MIMETYPE_TEXT_HTML) && item.getHtmlText() != null) {
                out.put("html", item.getHtmlText());
            }
            call.resolve(out);
        });
    }
}
