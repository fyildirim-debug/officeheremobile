package com.officehere.mobile;

import android.content.res.Configuration;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Arayüz ilk kez çizilene kadar açılış ekranı kalır (en çok SPLASH_MAX_MS). */
    private static final long SPLASH_MAX_MS = 3000;

    private volatile boolean contentReady = false;

    /**
     * Etkinlik kayıtlı durumla mı kuruldu: sistem süreci arka planda sonlandırdı, kullanıcı son
     * kullanılanlardan ya da simgeden döndü. Kullanıcı uygulamayı kaydırıp kapattıysa kayıtlı durum
     * yoktur. Web tarafı bir kez okur (OfficeHereWindow.launchState); aynı süreçte sayfa yeniden
     * yüklenirse (WebView çökmesi) ikinci kez geri getirme yapılmaz.
     */
    private static boolean restoredLaunch = false;

    static synchronized boolean takeRestoredLaunch() {
        boolean r = restoredLaunch;
        restoredLaunch = false;
        return r;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        synchronized (MainActivity.class) {
            restoredLaunch = savedInstanceState != null;
        }
        // Yeniden oluşturulan etkinlik (ör. süreç geri yüklemesi) başlangıç dosyasını ikinci kez açmasın.
        if (savedInstanceState != null && getIntent() != null) {
            getIntent().putExtra(OfficeHereFilesPlugin.EXTRA_HANDLED, true);
        }
        // Uygulamaya özel eklentiler köprü kurulmadan önce kaydedilmeli.
        registerPlugin(OfficeHereFilesPlugin.class);
        registerPlugin(OfficeHereWindowPlugin.class);
        registerPlugin(OfficeHereSystemPlugin.class);
        super.onCreate(savedInstanceState);

        // Her Android sürümünde aynı yerleşim: içerik sistem çubuklarının altına uzanır,
        // boşlukları Capacitor SystemBars + CSS env(safe-area-inset-*) yönetir.
        EdgeToEdge.enable(this);

        // WebView sayfayı çizene kadar tema zemini görünsün (koyu kipte beyaz parlama olmasın).
        if (bridge != null) {
            WebView webView = bridge.getWebView();
            if (webView != null) {
                webView.setBackgroundColor(ContextCompat.getColor(this, R.color.oh_window));
            }
        }

        splash.setKeepOnScreenCondition(() -> !contentReady);
        new Handler(Looper.getMainLooper()).postDelayed(this::markContentReady, SPLASH_MAX_MS);
    }

    /** Web tarafı ilk ekranı çizdiğinde (OfficeHereWindow.ready) çağrılır. */
    void markContentReady() {
        contentReady = true;
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // SystemBars eklentisi yapılandırma değişiminde pencere zeminini sıfırlar; tema rengini geri koy.
        OfficeHereWindowPlugin.reapply(this);
    }
}
