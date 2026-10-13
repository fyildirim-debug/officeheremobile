package com.officehere.mobile;

import android.app.Activity;
import android.graphics.Color;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pencere zemini ve açılış ekranı. Kenardan kenara yerleşimde eski WebView'lerde (sistem
 * çubuklarının arkası boşluk olarak bırakılır) görünen zemin, uygulama çubuğunun rengine boyanır.
 */
@CapacitorPlugin(name = "OfficeHereWindow")
public class OfficeHereWindowPlugin extends Plugin {

    /** Son istenen zemin rengi; yapılandırma değişiminden sonra yeniden uygulanır. */
    private static Integer background;

    @PluginMethod
    public void setBackground(PluginCall call) {
        final int color;
        try {
            color = Color.parseColor(call.getString("color", ""));
        } catch (IllegalArgumentException e) {
            call.reject("Geçersiz renk");
            return;
        }
        getBridge().executeOnMainThread(() -> {
            background = color;
            reapply(getActivity());
            call.resolve();
        });
    }

    /** Web arayüzü ilk ekranı çizdi: açılış ekranı kapanabilir. */
    @PluginMethod
    public void ready(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            ((MainActivity) activity).markContentReady();
        }
        call.resolve();
    }

    static void reapply(Activity activity) {
        Integer color = background;
        if (color != null && activity != null && activity.getWindow() != null) {
            activity.getWindow().getDecorView().setBackgroundColor(color);
        }
    }
}
