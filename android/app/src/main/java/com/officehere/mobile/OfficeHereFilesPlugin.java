package com.officehere.mobile;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.UriPermission;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import androidx.activity.result.ActivityResult;
import androidx.core.content.IntentCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;

/**
 * Belge seçme (ACTION_OPEN_DOCUMENT), aynı konuma yazma, yeni konuma kaydetme
 * (ACTION_CREATE_DOCUMENT) ve "Birlikte aç" / "Gönder" ile gelen dosyalar.
 *
 * Baytlar köprüden base64 olarak taşınmaz: okunan dosya önbellekte geçici bir kopyaya
 * yazılır ("path"), web tarafı onu Capacitor'ün yerel sunucusundan (convertFileSrc) okur
 * ve "discard" ile siler. Yazılacak baytlar da önbellekteki geçici dosyadan alınır.
 */
@CapacitorPlugin(name = "OfficeHereFiles")
public class OfficeHereFilesPlugin extends Plugin {

    private static final String TAG = "OfficeHereFiles";
    static final String EVENT_OPEN = "externalOpen";
    /** İşlenmiş intent işareti (yeniden oluşturulan etkinlikte dosya ikinci kez açılmaz). */
    static final String EXTRA_HANDLED = "com.officehere.mobile.HANDLED";

    private static final String DIR_IN = "oh-in";
    private static final String DIR_OUT = "oh-out";
    private static final String DIR_SHARE = "oh-share";
    private static final long SHARE_KEEP_MS = 24L * 60 * 60 * 1000;
    private static final long MAX_BYTES = 200L * 1024 * 1024;

    private static final int READ = Intent.FLAG_GRANT_READ_URI_PERMISSION;
    private static final int WRITE = Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    /** Kopyalama işleri tek iş parçacığında sırayla (temizlik → gelen dosya sırası korunur). */
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    /** Kodlu hata: web tarafı NO_ACCESS / NOT_FOUND / UNSUPPORTED / TOO_LARGE / IO ayırır. */
    private static final class CodedException extends IOException {

        final String code;

        CodedException(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    @Override
    public void load() {
        io.execute(this::cleanTemp);
    }

    @Override
    protected void handleOnDestroy() {
        io.shutdown();
    }

    // ---- Dışarıdan gelen dosyalar ----

    /** Soğuk açılışta da çağrılır: BridgeActivity.load() başlangıç intent'ini buraya verir. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || intent.getBooleanExtra(EXTRA_HANDLED, false)) return;
        // "Son kullanılanlar"dan yeniden başlatmada eski intent tekrar gelir; dosya yeniden açılmaz.
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
        String action = intent.getAction();
        Uri uri = null;
        CharSequence text = null;
        if (Intent.ACTION_VIEW.equals(action) || Intent.ACTION_EDIT.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            uri = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
            if (uri == null) text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        } else {
            return;
        }
        if (uri == null && text == null) return;
        intent.putExtra(EXTRA_HANDLED, true);

        final Uri u = uri;
        final String t = text != null ? text.toString() : null;
        final String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        final String type = intent.getType();
        final int flags = intent.getFlags();
        io.execute(() -> {
            JSObject info = u != null ? incoming(u, type, flags) : sharedText(t, subject);
            // Dinleyici henüz yoksa (soğuk açılış) olay saklanır, ilk dinleyiciye verilir.
            getBridge().execute(() -> notifyListeners(EVENT_OPEN, info, true));
        });
    }

    private JSObject incoming(Uri uri, String type, int flags) {
        JSObject info = new JSObject();
        info.put("uri", uri.toString());
        info.put("name", fallbackName(uri));
        try {
            if ((flags & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0) {
                info.put("persisted", persist(uri, flags));
            }
            describeInto(info, uri, type);
            info.put("path", copyToTemp(uri, info.optLong("size", -1)).getAbsolutePath());
            info.put("writable", canWrite(uri));
        } catch (Exception e) {
            CodedException c = classify(e);
            Logger.error(TAG, "Gelen dosya okunamadı: " + uri, e);
            info.put("error", c.code);
            info.put("message", c.getMessage());
        }
        return info;
    }

    private JSObject sharedText(String text, String subject) {
        JSObject info = new JSObject();
        String base = subject != null && !subject.trim().isEmpty() ? subject.trim() : "Paylaşılan metin";
        info.put("name", safeName(base) + ".txt");
        info.put("mime", "text/plain");
        info.put("text", text);
        return info;
    }

    // ---- Seçme ----

    @PluginMethod
    public void pickDocument(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        String[] mimes = strings(call.getArray("mimeTypes"));
        if (mimes.length > 0) intent.putExtra(Intent.EXTRA_MIME_TYPES, mimes);
        intent.addFlags(READ | WRITE | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "onPicked");
    }

    @ActivityCallback
    private void onPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        getBridge().releaseCall(call);
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            resolveCancelled(call);
            return;
        }
        final Uri uri = data.getData();
        final int flags = data.getFlags();
        io.execute(() -> {
            try {
                JSObject info = new JSObject();
                info.put("uri", uri.toString());
                info.put("persisted", persist(uri, flags));
                describeInto(info, uri, null);
                info.put("path", copyToTemp(uri, info.optLong("size", -1)).getAbsolutePath());
                info.put("writable", canWrite(uri));
                call.resolve(info);
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    /** Son kullanılan belgeyi yeniden okur (kalıcı izinle). */
    @PluginMethod
    public void readDocument(PluginCall call) {
        final Uri uri = uriArg(call);
        if (uri == null) return;
        io.execute(() -> {
            try {
                JSObject info = new JSObject();
                info.put("uri", uri.toString());
                describeInto(info, uri, null);
                info.put("path", copyToTemp(uri, info.optLong("size", -1)).getAbsolutePath());
                info.put("writable", canWrite(uri));
                call.resolve(info);
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    // ---- Kaydetme ----

    /** Geçici dosyayı (path) var olan belgenin üzerine yazar. */
    @PluginMethod
    public void writeDocument(PluginCall call) {
        final Uri uri = uriArg(call);
        if (uri == null) return;
        final File src = tempArg(call);
        if (src == null) return;
        io.execute(() -> {
            try {
                long size = writeTo(uri, src);
                JSObject info = new JSObject();
                info.put("uri", uri.toString());
                describeInto(info, uri, null);
                info.put("size", size);
                info.put("writable", true);
                call.resolve(info);
            } catch (Exception e) {
                fail(call, e);
            }
        });
    }

    /** Kullanıcıya konum ve ad seçtirir (öntanımlı ad "name"), geçici dosyayı oraya yazar. */
    @PluginMethod
    public void createDocument(PluginCall call) {
        if (tempArg(call) == null) return;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "Belge"));
        String initial = call.getString("initialUri");
        if (initial != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Uri hint = Uri.parse(initial);
            // Belge seçici yalnız belge sağlayıcı adreslerini başlangıç klasörü olarak kabul eder.
            if (DocumentsContract.isDocumentUri(getContext(), hint)) {
                intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, hint);
            }
        }
        intent.addFlags(READ | WRITE | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "onCreated");
    }

    @ActivityCallback
    private void onCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        getBridge().releaseCall(call);
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            resolveCancelled(call);
            return;
        }
        final Uri uri = data.getData();
        final int flags = data.getFlags() | READ | WRITE;
        final File src = tempArg(call);
        if (src == null) return;
        io.execute(() -> {
            try {
                boolean persisted = persist(uri, flags);
                long size = writeTo(uri, src);
                JSObject info = new JSObject();
                info.put("uri", uri.toString());
                describeInto(info, uri, null);
                info.put("size", size);
                info.put("writable", true);
                info.put("persisted", persisted);
                call.resolve(info);
            } catch (Exception e) {
                // Yarım kalan boş belge bırakılmaz.
                try {
                    DocumentsContract.deleteDocument(resolver(), uri);
                } catch (Exception ignored) {
                    // silinemiyorsa kalır
                }
                fail(call, e);
            }
        });
    }

    /** Okunan geçici kopyayı siler. */
    @PluginMethod
    public void discard(PluginCall call) {
        File f = tempFile(call.getString("path"));
        if (f != null && f.exists() && !f.delete()) Logger.debug(TAG, "Geçici dosya silinemedi: " + f);
        call.resolve();
    }

    /** Son kullanılanlarda olmayan belgelerin kalıcı izinlerini bırakır (sistem sınırı dolmasın). */
    @PluginMethod
    public void releaseUnused(PluginCall call) {
        Set<String> keep = new HashSet<>();
        for (String s : strings(call.getArray("keep"))) keep.add(s);
        ContentResolver r = resolver();
        int released = 0;
        for (UriPermission p : r.getPersistedUriPermissions()) {
            if (keep.contains(p.getUri().toString())) continue;
            int mode = (p.isReadPermission() ? READ : 0) | (p.isWritePermission() ? WRITE : 0);
            try {
                r.releasePersistableUriPermission(p.getUri(), mode);
                released++;
            } catch (SecurityException ignored) {
                // zaten bırakılmış
            }
        }
        JSObject ret = new JSObject();
        ret.put("released", released);
        call.resolve(ret);
    }

    // ---- Yardımcılar ----

    private ContentResolver resolver() {
        return getContext().getContentResolver();
    }

    private void resolveCancelled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("cancelled", true);
        call.resolve(ret);
    }

    private Uri uriArg(PluginCall call) {
        String s = call.getString("uri");
        if (s == null || s.isEmpty()) {
            call.reject("uri gerekli", "ARG");
            return null;
        }
        return Uri.parse(s);
    }

    private File tempArg(PluginCall call) {
        File f = tempFile(call.getString("path"));
        if (f == null || !f.isFile()) {
            call.reject("Geçici dosya bulunamadı", "ARG");
            return null;
        }
        return f;
    }

    /** Yalnız uygulama önbelleğindeki dosyalar (file:// adresi ya da mutlak yol). */
    private File tempFile(String path) {
        if (path == null || path.isEmpty()) return null;
        String p = path.startsWith("file:") ? Uri.parse(path).getPath() : path;
        if (p == null) return null;
        try {
            File f = new File(p).getCanonicalFile();
            String cache = getContext().getCacheDir().getCanonicalPath() + File.separator;
            return f.getPath().startsWith(cache) ? f : null;
        } catch (IOException e) {
            return null;
        }
    }

    private static String[] strings(JSArray arr) {
        List<String> out = new ArrayList<>();
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                try {
                    String s = arr.getString(i);
                    if (s != null && !s.isEmpty()) out.add(s);
                } catch (JSONException ignored) {
                    // dize olmayan öğe atlanır
                }
            }
        }
        return out.toArray(new String[0]);
    }

    private boolean persist(Uri uri, int flags) {
        if (!"content".equals(uri.getScheme())) return false;
        ContentResolver r = resolver();
        int want = flags & (READ | WRITE);
        if (want == 0) want = READ;
        try {
            r.takePersistableUriPermission(uri, want);
            return true;
        } catch (SecurityException e) {
            if ((want & WRITE) == 0) return false;
            try {
                r.takePersistableUriPermission(uri, READ);
                return true;
            } catch (SecurityException ignored) {
                return false;
            }
        }
    }

    private boolean canWrite(Uri uri) {
        if ("file".equals(uri.getScheme())) {
            String p = uri.getPath();
            return p != null && new File(p).canWrite();
        }
        Context ctx = getContext();
        if (ctx.checkCallingOrSelfUriPermission(uri, WRITE) != PackageManager.PERMISSION_GRANTED) return false;
        if (DocumentsContract.isDocumentUri(ctx, uri)) {
            try (Cursor c = resolver().query(uri, new String[] { DocumentsContract.Document.COLUMN_FLAGS }, null, null, null)) {
                if (c != null && c.moveToFirst() && !c.isNull(0)) {
                    return (c.getInt(0) & DocumentsContract.Document.FLAG_SUPPORTS_WRITE) != 0;
                }
            } catch (Exception ignored) {
                // bayrak okunamazsa izin yeterli sayılır
            }
        }
        return true;
    }

    /** Ad, MIME ve boyut. İzin yoksa SecurityException fırlatır. */
    private void describeInto(JSObject info, Uri uri, String fallbackMime) throws FileNotFoundException {
        String name = null;
        long size = -1;
        if ("file".equals(uri.getScheme())) {
            String p = uri.getPath();
            if (p == null) throw new FileNotFoundException(uri.toString());
            File f = new File(p);
            name = f.getName();
            size = f.length();
        } else {
            try (
                Cursor c = resolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)
            ) {
                if (c != null && c.moveToFirst()) {
                    int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (ni >= 0 && !c.isNull(ni)) name = c.getString(ni);
                    int si = c.getColumnIndex(OpenableColumns.SIZE);
                    if (si >= 0 && !c.isNull(si)) size = c.getLong(si);
                }
            } catch (SecurityException e) {
                throw e;
            } catch (IllegalArgumentException e) {
                // Silinmiş belge: sağlayıcı adresi tanımıyor.
                throw new FileNotFoundException(e.getMessage());
            } catch (Exception e) {
                Logger.debug(TAG, "Dosya bilgisi alınamadı: " + e.getMessage());
            }
        }
        if (name == null || name.trim().isEmpty()) name = fallbackName(uri);
        String mime = null;
        try {
            mime = resolver().getType(uri);
        } catch (Exception ignored) {
            // tür bilinmiyor
        }
        if (mime == null || mime.isEmpty()) mime = fallbackMime;
        if (mime == null) {
            String ext = MimeTypeMap.getFileExtensionFromUrl(name.replace(' ', '_')).toLowerCase(Locale.ROOT);
            mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        }
        info.put("name", name);
        if (mime != null) info.put("mime", mime);
        if (size >= 0) info.put("size", size);
    }

    private static String fallbackName(Uri uri) {
        String seg = uri.getLastPathSegment();
        if (seg == null || seg.isEmpty()) return "Belge";
        int cut = Math.max(seg.lastIndexOf('/'), seg.lastIndexOf(':'));
        String name = cut >= 0 ? seg.substring(cut + 1) : seg;
        return name.isEmpty() ? "Belge" : name;
    }

    private static String safeName(String s) {
        String out = s.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", " ").trim();
        if (out.length() > 80) out = out.substring(0, 80).trim();
        return out.isEmpty() ? "Belge" : out;
    }

    private File copyToTemp(Uri uri, long knownSize) throws IOException {
        if (knownSize > MAX_BYTES) throw tooLarge();
        File dir = new File(getContext().getCacheDir(), DIR_IN);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Önbellek dizini oluşturulamadı");
        File out = new File(dir, UUID.randomUUID() + ".bin");
        try (InputStream in = resolver().openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
            if (in == null) throw new FileNotFoundException(uri.toString());
            copy(in, os, MAX_BYTES);
        } catch (IOException | RuntimeException e) {
            if (out.exists() && !out.delete()) Logger.debug(TAG, "Yarım kopya silinemedi");
            throw e;
        }
        return out;
    }

    /**
     * Belgenin üzerine yazar. Önce kesmeli tanımlayıcı ("rwt"): sağlayıcı kesmeyi yok sayarsa
     * eski içerikten kalan baytlar elle kesilir. Desteklenmiyorsa "wt" akışı. Kesmeyen "w"
     * kipi kullanılmaz (kısa yeni içerik eski dosyanın sonunu bozuk bırakırdı).
     */
    private long writeTo(Uri uri, File src) throws IOException {
        if ("file".equals(uri.getScheme())) {
            String p = uri.getPath();
            if (p == null) throw new FileNotFoundException(uri.toString());
            try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(p)) {
                return copy(in, out, Long.MAX_VALUE);
            }
        }
        ContentResolver r = resolver();
        try (ParcelFileDescriptor pfd = r.openFileDescriptor(uri, "rwt")) {
            if (pfd != null) {
                try (InputStream in = new FileInputStream(src); FileOutputStream out = new FileOutputStream(pfd.getFileDescriptor())) {
                    long n = copy(in, out, Long.MAX_VALUE);
                    try {
                        FileChannel ch = out.getChannel();
                        if (ch.size() > n) ch.truncate(n);
                        out.getFD().sync();
                    } catch (IOException ignored) {
                        // boru tabanlı tanımlayıcı: boyut/eşitleme yok
                    }
                    return n;
                }
            }
        } catch (IllegalArgumentException | UnsupportedOperationException | FileNotFoundException e) {
            Logger.debug(TAG, "rwt desteklenmiyor, wt deneniyor: " + e.getMessage());
        }
        try (OutputStream out = r.openOutputStream(uri, "wt"); InputStream in = new FileInputStream(src)) {
            if (out == null) throw new FileNotFoundException(uri.toString());
            return copy(in, out, Long.MAX_VALUE);
        } catch (IllegalArgumentException | UnsupportedOperationException e) {
            throw new CodedException("UNSUPPORTED", "Bu konum üzerine yazmayı desteklemiyor.");
        }
    }

    private static long copy(InputStream in, OutputStream out, long limit) throws IOException {
        byte[] buf = new byte[64 * 1024];
        long total = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > limit) throw tooLarge();
            out.write(buf, 0, n);
        }
        out.flush();
        return total;
    }

    private static CodedException tooLarge() {
        return new CodedException("TOO_LARGE", "Dosya çok büyük (en çok " + (MAX_BYTES / (1024 * 1024)) + " MB).");
    }

    private static CodedException classify(Exception e) {
        if (e instanceof CodedException) return (CodedException) e;
        String msg = String.valueOf(e.getMessage());
        if (e instanceof SecurityException || msg.contains("EACCES") || msg.contains("Permission denied")) {
            return new CodedException("NO_ACCESS", "Dosyaya erişim izni yok.");
        }
        if (e instanceof FileNotFoundException || e instanceof IllegalArgumentException) {
            return new CodedException("NOT_FOUND", "Dosya bulunamadı.");
        }
        return new CodedException("IO", "Dosya işlenemedi: " + msg);
    }

    private void fail(PluginCall call, Exception e) {
        CodedException c = classify(e);
        Logger.error(TAG, c.getMessage(), e);
        call.reject(c.getMessage(), c.code, e);
    }

    /** Açılışta önceki oturumdan kalan geçici dosyaları siler. */
    private void cleanTemp() {
        File cache = getContext().getCacheDir();
        deleteTree(new File(cache, DIR_IN), 0);
        deleteTree(new File(cache, DIR_OUT), 0);
        // Paylaşılan kopyaları alan uygulama geç okuyabilir: bir gün tutulur.
        deleteTree(new File(cache, DIR_SHARE), SHARE_KEEP_MS);
    }

    private static void deleteTree(File f, long keepMs) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k, keepMs);
        boolean old = keepMs <= 0 || System.currentTimeMillis() - f.lastModified() > keepMs;
        if (old && f.exists() && !f.delete() && f.isFile()) Logger.debug(TAG, "Silinemedi: " + f);
    }
}
