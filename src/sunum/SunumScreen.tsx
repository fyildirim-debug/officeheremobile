// Sunum ekranı: masaüstü Sunum'un okuyucu/yazıcıları, modeli, slayt çizimi, gösterisi ve
// metin düzenleyicisi üzerine dokunmatik kabuk.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown24Regular,
  ArrowRedo24Regular,
  ArrowUndo24Regular,
  ArrowUp24Regular,
  Checkmark24Regular,
  Copy24Regular,
  Delete24Regular,
  Dismiss24Regular,
  DocumentCopy24Regular,
  Edit24Regular,
  Eye24Regular,
  EyeOff24Regular,
  Grid24Regular,
  MoreVertical24Regular,
  Play24Regular,
  Print24Regular,
  Save24Regular,
  SaveCopy24Regular,
  Share24Regular,
  SlideAdd24Regular,
  SlidePlay24Regular,
} from "@fluentui/react-icons";
import { FORMATS, isSunuFormat, type SaveFormat } from "@sunum/io/formats";
import { useStore } from "@sunum/state/store";
import { applyRun, common, setParaProps, textInfo } from "@sunum/state/textActions";
import type { Color } from "@sunum/model/types";
import "@sunum/styles/slide.css";
import "@sunum/styles/show.css";
import "@sunum/styles/print.css";
import { PrintRoot } from "@sunum/app/PrintPages";
import { buildPrintPages, paperSize, printSlideIndices } from "@sunum/app/printLayout";
import { DEFAULT_PRINT_SETTINGS } from "@sunum/io/presProps";
import "./sunum.css";
import { AppBar } from "../shell/AppBar";
import { Sheet } from "../shell/Toolbar";
import { confirmDialog, toast } from "../shell/feedback";
import { useBackHandler } from "../shell/back";
import { inc, yazdirKisayolu, yazdirmaAc, YAZDIR_ETIKETI } from "../shell/yazdir";
import { useTaslak } from "../shell/useTaslak";
import { recentWhen } from "../home/util";
import { APP_LABEL, baseOf, extOf, type DocScreenProps } from "../platform";
import { kayitAdi, kayitBicimi, slaytBoyutu, sunuAc, sunuBaytlari, sunumMime, type AcilanSunu } from "./dosya";
import { koyuSunu, resimDinle } from "./koyu";
import { slaytCogalt, slaytEkle, slaytGizle, slaytSil, slaytTasi, yeniOturum, type Oturum } from "./oturum";
import { SlaytAlani } from "./SlaytAlani";
import { gorunumFn, KucukResimSeridi, SlaytIzgarasi } from "./KucukResimler";
import { NotlarPaneli } from "./Notlar";
import { Gosteri } from "./Gosteri";
import { DuzenAracCubugu, DuzenPaneli, HizaPaneli, RenkPaneli, type Panel } from "./Araclar";

type Yukleme = { durum: "yukleniyor" } | { durum: "hata"; mesaj: string } | { durum: "hazir"; oturum: Oturum; acilan: AcilanSunu };

export default function SunumScreen(props: DocScreenProps) {
  const { doc, onClose } = props;
  const [yuk, setYuk] = useState<Yukleme>({ durum: "yukleniyor" });
  useEffect(() => {
    let iptal = false;
    sunuAc(doc)
      .then((acilan) => {
        if (iptal) return;
        const oturum = yeniOturum(acilan.pres, baseOf(acilan.ad));
        // Kurtarılan taslak kaydedilene dek "Kaydedilmedi".
        if (acilan.kurtarildi) oturum.store.set({ dirty: true });
        setYuk({ durum: "hazir", oturum, acilan });
      })
      .catch((e: unknown) => !iptal && setYuk({ durum: "hata", mesaj: e instanceof Error ? e.message : String(e) }));
    return () => {
      iptal = true;
    };
  }, [doc]);
  useBackHandler(() => onClose(), yuk.durum !== "hazir");

  if (yuk.durum === "hazir") return <Sunum {...props} oturum={yuk.oturum} acilan={yuk.acilan} />;
  return (
    <div className="m-screen m-sunum">
      <AppBar title={doc.name} subtitle={`${APP_LABEL.sunum} · ${yuk.durum === "hata" ? "Açılamadı" : "Açılıyor…"}`} onBack={onClose} />
      <main className="m-content" style={{ position: "relative" }}>
        {yuk.durum === "hata" ? (
          <div className="m-sunum-bos" role="alert">
            <p className="m-sunum-hata">Dosya açılamadı: {yuk.mesaj}</p>
            <button type="button" className="m-btn" onClick={onClose}>
              Geri dön
            </button>
          </div>
        ) : (
          <div className="m-sunum-bos">Açılıyor…</div>
        )}
      </main>
    </div>
  );
}

/** Odağı (metin düzenleyiciyi) bırakmayan üst çubuk düğmesi. */
function Dugme({ label, onClick, children, active, disabled }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={`m-iconbtn${active ? " is-active" : ""}`} aria-label={label} title={label} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

function MenuSatiri({ icon, label, onClick, disabled, danger }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" className={`m-list-item${danger ? " is-danger" : ""}`} disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function useMedya(q: string): boolean {
  const [m, setM] = useState(() => typeof matchMedia === "function" && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    on();
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

/** Kullanıcı konum seçmekten/paylaşmaktan vazgeçti (hata sayılmaz). */
const vazgecildi = (e: unknown) => e instanceof Error && e.name === "AbortError";

const NOT_KEY = "officehere.mobile.sunum.notlar";
const notTercihi = () => {
  try {
    return localStorage.getItem(NOT_KEY) === "1";
  } catch {
    return false;
  }
};

type SunumProps = DocScreenProps & { oturum: Oturum; acilan: AcilanSunu };
type Sayfa = null | "daha" | "farkli" | "slayt" | Panel;

function Sunum({ doc, platform, onClose, dark, oturum, acilan }: SunumProps) {
  const { store, a } = oturum;
  const s = useStore(store);
  const pres = s.pres;
  const n = pres.slides.length;
  const slide = pres.slides[s.slideIdx];
  const [dosya, setDosya] = useState({ ad: acilan.ad, bicim: acilan.bicim as string, kayitli: !acilan.yeni });
  const [duzenle, setDuzenle] = useState(!doc.data);
  const [sayfa, setSayfa] = useState<Sayfa>(null);
  const [menuSlayt, setMenuSlayt] = useState(0);
  const [izgara, setIzgara] = useState(false);
  const [gosteri, setGosteri] = useState<{ start: number } | null>(null);
  const [notAcik, setNotAcik] = useState(notTercihi);
  const [teklif, setTeklif] = useState(!!acilan.gosteri);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [yazdiriliyor, setYazdiriliyor] = useState(false);
  // Yazdırma: sunudaki kayıtlı ayarlar (yoksa tam sayfa slaytlar) ve kâğıt boyutu.
  const baskiAyari = pres.printSettings ?? DEFAULT_PRINT_SETTINGS;
  const baskiBoyutu = paperSize(pres, baskiAyari.what, baskiAyari.orientation);
  const genis = useMedya("(min-width: 600px)");
  const uyarildi = useRef(false);

  const bildirildi = useRef(false);
  useEffect(() => {
    if (bildirildi.current) return;
    if (doc.recovered) toast(`Kurtarılan taslak (${recentWhen(doc.recovered.savedAt)}): kaydedilmemiş değişiklikler geri getirildi.`);
    else if (acilan.bildirim) toast(acilan.bildirim);
    bildirildi.current = true;
  }, [acilan, doc.recovered]);

  // Otomatik kurtarma: kaydedilmemiş değişiklikler taslak olarak saklanır (tam doğrulukla .pptx).
  const uriRef = useRef(doc.uri);
  const dosyaRef = useRef(dosya);
  dosyaRef.current = dosya;
  useTaslak({
    app: "sunum",
    kirli: s.dirty,
    surum: s.pres,
    id: doc.recovered?.id,
    bilgi: () => ({ name: dosyaRef.current.ad, uri: uriRef.current, ek: { bicim: dosyaRef.current.bicim } }),
    kodla: async () => ({ data: await sunuBaytlari(a.s.pres, "pptx", "taslak.pptx"), dataName: "taslak.pptx" }),
    // Süreç sonlanmasından dönüşte etkin slayt geri gelir.
    gorunum: {
      al: () => ({ slayt: a.s.slideIdx }),
      ver: (g) => {
        const i = typeof g.slayt === "number" ? Math.max(0, Math.min(a.s.pres.slides.length - 1, Math.round(g.slayt))) : a.s.slideIdx;
        if (i === a.s.slideIdx) return "hazir";
        a.goToSlide(i);
        return "uygulandi";
      },
    },
  });

  // Açık resim zeminlerin ölçümü bitince koyu görünüm yeniden hesaplanır.
  const [resimSurum, setResimSurum] = useState(0);
  useEffect(() => resimDinle(() => setResimSurum((v) => v + 1)), []);
  const koyu = useMemo(() => (dark ? koyuSunu(pres) : null), [dark, pres, resimSurum]); // eslint-disable-line react-hooks/exhaustive-deps
  const gorunum = useMemo(() => gorunumFn(pres, koyu), [pres, koyu]);
  const g = useMemo(() => (slide ? gorunum(s.slideIdx) : null), [gorunum, s.slideIdx, slide]);
  const info = useMemo(() => (duzenle ? textInfo(a) : null), [a, duzenle, s.pres, s.sel, s.editing, s.textTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const kipDegistir = (on: boolean) => {
    if (!on) {
      a.stopEditing();
      a.select([]);
      setSayfa(null);
    }
    setDuzenle(on);
  };

  const git = useCallback((i: number) => a.goToSlide(i), [a]);

  const oynat = (start: number) => {
    if (!n) return;
    a.stopEditing();
    setSayfa(null);
    setIzgara(false);
    // Gösteri bu dokunuşun etkinliğiyle (beklemeden) açılmalı: tam ekranı kendisi ister.
    setGosteri({ start: Math.max(0, Math.min(n - 1, start)) });
  };

  /** Kaydet; `as` verilirse Farklı kaydet (konum sorulur). Vazgeçilirse sessizce false. */
  const kaydet = async (as?: SaveFormat): Promise<boolean> => {
    if (kaydediliyor) return false;
    a.stopEditing();
    const { bicim, donusur } = as ? { bicim: as, donusur: false } : kayitBicimi(dosya.bicim);
    const ad = kayitAdi(dosya.ad, bicim);
    const pres0 = a.s.pres;
    setKaydediliyor(true);
    try {
      const bytes = await sunuBaytlari(pres0, bicim, ad);
      const saved = await platform.saveFile(ad, bytes, sunumMime(ad), as ? { saveAs: true } : undefined);
      // Kullanıcının seçtiği gerçek ad başlıkta ve sonraki kayıtlarda kullanılır; biçim yazılan biçimdir.
      const yeniAd = saved.name || ad;
      if (saved.uri) uriRef.current = saved.uri;
      setDosya({ ad: yeniAd, bicim, kayitli: true });
      // Kayıt sürerken yapılan değişiklik kirli kalır.
      store.set({ dirty: a.s.pres !== pres0, fileName: baseOf(yeniAd) });
      if (donusur) toast(`“${dosya.ad}” bu biçimde kaydedilemez; “${yeniAd}” olarak kaydedildi.`, "info");
      else toast(`“${yeniAd}” kaydedildi.`, "success");
      return true;
    } catch (e) {
      if (!vazgecildi(e)) toast(`Kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`, "error");
      return false;
    } finally {
      setKaydediliyor(false);
    }
  };

  const paylas = async () => {
    a.stopEditing();
    const { bicim } = kayitBicimi(dosya.bicim);
    const ad = kayitAdi(dosya.ad, bicim);
    try {
      await platform.shareFile(ad, await sunuBaytlari(a.s.pres, bicim, ad), sunumMime(ad));
    } catch (e) {
      if (!vazgecildi(e)) toast(`Paylaşılamadı: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };

  const geri = async () => {
    a.stopEditing();
    if (!a.s.dirty) return onClose();
    const r = await confirmDialog({
      title: "Değişiklikler kaydedilsin mi?",
      message: `“${dosya.ad}” dosyasında kaydedilmemiş değişiklikler var.`,
      buttons: [
        { id: "kaydet", label: "Kaydet" },
        { id: "kaydetme", label: "Kaydetme", danger: true },
        { id: "vazgec", label: "Vazgeç" },
      ],
    });
    if (r === "kaydetme" || (r === "kaydet" && (await kaydet()))) onClose();
  };

  /** Yazdır / PDF: masaüstü yazdırma kökü (her gösterilen slayt bir sayfa, özgün renklerle). */
  // Yazdırma kökü hazır olunca iletişim kutusu bir kez açılır (StrictMode'da kök etkisi iki kez çalışır).
  const basildi = useRef(false);
  const yazdir = () => {
    if (!n || yazdiriliyor) return;
    a.stopEditing();
    setSayfa(null);
    basildi.current = false;
    setYazdiriliyor(true);
  };
  const yazdirRef = useRef(yazdir);
  yazdirRef.current = yazdir;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!yazdirKisayolu(e)) return;
      e.preventDefault();
      yazdirRef.current();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // Donanım klavyesi (tablet): ok tuşlarıyla slayt değiştirme (metin/not yazılmıyorken).
  useEffect(() => {
    if (gosteri || izgara) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || a.s.editing || t?.closest("input, textarea, select, [contenteditable='true']")) return;
      const yon = e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp" ? -1 : 0;
      const hedef = a.s.slideIdx + yon;
      if (!yon || hedef < 0 || hedef >= a.s.pres.slides.length) return;
      e.preventDefault();
      a.goToSlide(hedef);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a, gosteri, izgara]);

  // Geri tuşu: gösteri ve ızgara kendi işleyicileriyle önce kapanır; sonra panel, metin düzenleme, ekran.
  useBackHandler(() => void geri());
  useBackHandler(() => a.stopEditing(), !!s.editing);
  useBackHandler(() => setSayfa(null), !!sayfa);

  const notDegis = () => {
    setNotAcik((v) => {
      try {
        localStorage.setItem(NOT_KEY, v ? "0" : "1");
      } catch {
        // depolama kapalı: yalnız bu oturum
      }
      return !v;
    });
  };

  const slaytMenusu = (i: number) => {
    a.goToSlide(i);
    setMenuSlayt(i);
    setSayfa("slayt");
  };

  const saltGoruntu = () => {
    if (uyarildi.current) return;
    uyarildi.current = true;
    toast("Şekiller, resimler, grafikler ve tablolar mobilde yalnız görüntülenir; metin kutularına dokunarak yazabilirsiniz.");
  };

  const kayitDurumu = kaydediliyor ? "Kaydediliyor…" : dosya.kayitli && !s.dirty ? "Kaydedildi" : "Kaydedilmedi";
  const gizliSayi = pres.slides.filter((x) => x.hidden).length;
  const bicimEtiketi = isSunuFormat(dosya.bicim) ? FORMATS[dosya.bicim].label : "Sunu";
  const menuHedef = pres.slides[menuSlayt];
  const runs = info?.runs ?? [];
  const kapat = () => setSayfa(null);

  const actions = duzenle ? (
    <>
      <Dugme label="Geri al" disabled={!store.canUndo} onClick={() => store.undo()}>
        <ArrowUndo24Regular />
      </Dugme>
      <Dugme label="Yinele" disabled={!store.canRedo} onClick={() => store.redo()}>
        <ArrowRedo24Regular />
      </Dugme>
      {genis && (
        <Dugme label="Oynat" disabled={!n} onClick={() => oynat(s.slideIdx)}>
          <Play24Regular />
        </Dugme>
      )}
      <Dugme label="Kaydet" disabled={kaydediliyor} onClick={() => void kaydet()}>
        <Save24Regular />
      </Dugme>
      <Dugme label="Daha fazla" onClick={() => setSayfa("daha")}>
        <MoreVertical24Regular />
      </Dugme>
    </>
  ) : (
    <>
      <Dugme label="Oynat" disabled={!n} onClick={() => oynat(s.slideIdx)}>
        <Play24Regular />
      </Dugme>
      <Dugme label="Kaydet" disabled={kaydediliyor} onClick={() => void kaydet()}>
        <Save24Regular />
      </Dugme>
      <Dugme label="Düzenle" onClick={() => kipDegistir(true)}>
        <Edit24Regular />
      </Dugme>
      <Dugme label="Daha fazla" onClick={() => setSayfa("daha")}>
        <MoreVertical24Regular />
      </Dugme>
    </>
  );

  return (
    <div className={`m-screen m-sunum${duzenle ? " is-duzenle" : ""}${s.editing ? " is-yaziyor" : ""}`}>
      {koyu?.css && <style>{koyu.css}</style>}
      <AppBar title={dosya.ad} subtitle={`${APP_LABEL.sunum} · ${kayitDurumu}`} onBack={() => void geri()} actions={actions} />
      {teklif && (
        <div className="m-sunum-banner" role="status">
          <span>Bu dosya bir slayt gösterisi.</span>
          <button
            type="button"
            className="m-btn is-primary"
            onClick={() => {
              setTeklif(false);
              oynat(0);
            }}
          >
            Gösteriyi başlat
          </button>
          <button type="button" className="m-iconbtn" aria-label="Kapat" onClick={() => setTeklif(false)}>
            <Dismiss24Regular />
          </button>
        </div>
      )}
      <main className="m-content m-sunum-main" inert={izgara || !!gosteri}>
        <SlaytAlani
          g={g}
          state={s}
          a={a}
          duzenle={duzenle}
          onGit={git}
          onSaltGoruntu={saltGoruntu}
          bos={
            <div className="m-sunum-bos">
              <span>Bu sunuda slayt yok.</span>
              {duzenle && (
                <button type="button" className="m-btn is-primary" onClick={() => setSayfa("duzen")}>
                  Slayt ekle
                </button>
              )}
            </div>
          }
        />
        <KucukResimSeridi pres={pres} gorunum={gorunum} current={s.slideIdx} onPick={git} onMenu={slaytMenusu} onAdd={duzenle ? () => setSayfa("duzen") : undefined} />
        <NotlarPaneli slideId={slide?.id} notes={slide?.notes ?? ""} duzenle={duzenle} acik={notAcik} onToggle={notDegis} onChange={(t) => a.setNotes(t)} />
      </main>
      {duzenle && <DuzenAracCubugu a={a} info={info} theme={pres.theme} onPanel={setSayfa} />}

      <Sheet open={sayfa === "renk"} title="Yazı rengi" modeless onClose={kapat}>
        <RenkPaneli
          theme={pres.theme}
          value={common<Color>(runs, "color")}
          onPick={(c) => {
            applyRun(a, (p) => ({ ...p, color: c ?? undefined }));
            kapat();
          }}
        />
      </Sheet>
      <Sheet open={sayfa === "hiza"} title="Hizalama" modeless onClose={kapat}>
        <HizaPaneli
          value={info?.para.align}
          onPick={(al) => {
            setParaProps(a, { align: al });
            kapat();
          }}
        />
      </Sheet>
      <Sheet open={sayfa === "duzen"} title="Yeni slayt" onClose={kapat}>
        <DuzenPaneli
          pres={pres}
          koyu={koyu}
          onPick={(id) => {
            kapat();
            slaytEkle(a, id);
          }}
        />
      </Sheet>
      <Sheet open={sayfa === "slayt" && !!menuHedef} title={`Slayt ${menuSlayt + 1}${menuHedef?.hidden ? " (gizli)" : ""}`} onClose={kapat}>
        <div className="m-list">
          <MenuSatiri icon={<Play24Regular />} label="Gösteriyi bu slayttan başlat" onClick={() => oynat(menuSlayt)} />
          {duzenle ? (
            <>
              <MenuSatiri icon={<SlideAdd24Regular />} label="Sonrasına yeni slayt ekle" onClick={() => setSayfa("duzen")} />
              <MenuSatiri
                icon={<Copy24Regular />}
                label="Çoğalt"
                onClick={() => {
                  kapat();
                  slaytCogalt(a, menuSlayt);
                }}
              />
              <MenuSatiri
                icon={<ArrowUp24Regular />}
                label="Yukarı taşı"
                disabled={menuSlayt === 0}
                onClick={() => {
                  kapat();
                  slaytTasi(a, menuSlayt, -1);
                }}
              />
              <MenuSatiri
                icon={<ArrowDown24Regular />}
                label="Aşağı taşı"
                disabled={menuSlayt >= n - 1}
                onClick={() => {
                  kapat();
                  slaytTasi(a, menuSlayt, 1);
                }}
              />
              <MenuSatiri
                icon={menuHedef?.hidden ? <Eye24Regular /> : <EyeOff24Regular />}
                label={menuHedef?.hidden ? "Slaydı göster" : "Slaydı gizle"}
                onClick={() => {
                  kapat();
                  slaytGizle(a, menuSlayt);
                }}
              />
              <MenuSatiri
                icon={<Delete24Regular />}
                label="Sil"
                danger
                onClick={() => {
                  kapat();
                  slaytSil(a, menuSlayt);
                }}
              />
            </>
          ) : (
            <MenuSatiri
              icon={<Edit24Regular />}
              label="Düzenlemeye geç"
              onClick={() => {
                kapat();
                kipDegistir(true);
              }}
            />
          )}
        </div>
      </Sheet>
      <Sheet open={sayfa === "daha"} title="Daha fazla" onClose={kapat}>
        <div className="m-list">
          {duzenle && <MenuSatiri icon={<Checkmark24Regular />} label="Düzenlemeyi bitir" onClick={() => kipDegistir(false)} />}
          <MenuSatiri icon={<SlidePlay24Regular />} label="Gösteriyi baştan başlat" disabled={!n} onClick={() => oynat(0)} />
          <MenuSatiri icon={<Play24Regular />} label="Geçerli slayttan başlat" disabled={!n} onClick={() => oynat(s.slideIdx)} />
          <MenuSatiri
            icon={<Grid24Regular />}
            label="Slaytlar"
            disabled={!n}
            onClick={() => {
              kapat();
              a.stopEditing();
              setIzgara(true);
            }}
          />
          <div className="m-sunum-menuayrac" />
          <MenuSatiri
            icon={<Share24Regular />}
            label="Paylaş"
            onClick={() => {
              kapat();
              void paylas();
            }}
          />
          <MenuSatiri icon={<SaveCopy24Regular />} label="Farklı kaydet" onClick={() => setSayfa("farkli")} />
          <MenuSatiri icon={<Print24Regular />} label={YAZDIR_ETIKETI} disabled={!n || pres.slides.every((x) => x.hidden)} onClick={yazdir} />
        </div>
        <p className="m-sunum-bilgi">
          <b>Slayt boyutu:</b> {slaytBoyutu(pres)}
          <br />
          <b>Slaytlar:</b> {n}
          {gizliSayi ? ` (${gizliSayi} gizli)` : ""}
          <br />
          <b>Biçim:</b> {bicimEtiketi} (.{extOf(dosya.ad) || "pptx"})
        </p>
      </Sheet>
      <Sheet open={sayfa === "farkli"} title="Farklı kaydet" onClose={kapat}>
        <div className="m-list">
          {(["pptx", "odp"] as SaveFormat[]).map((f) => (
            <MenuSatiri
              key={f}
              icon={f === "pptx" ? <Save24Regular /> : <DocumentCopy24Regular />}
              label={`${kayitAdi(dosya.ad, f)} — ${FORMATS[f].label}`}
              onClick={() => {
                kapat();
                void kaydet(f);
              }}
            />
          ))}
        </div>
      </Sheet>

      {izgara && (
        <SlaytIzgarasi
          pres={pres}
          gorunum={gorunum}
          current={s.slideIdx}
          onPick={(i) => {
            git(i);
            setIzgara(false);
          }}
          onMenu={slaytMenusu}
          onClose={() => setIzgara(false)}
        />
      )}
      {yazdiriliyor && (
        <PrintRoot
          pres={pres}
          pages={buildPrintPages(pres, baskiAyari, printSlideIndices(pres, baskiAyari, { kind: "all" }, s.slideIdx, []))}
          size={baskiBoyutu}
          settings={baskiAyari}
          onDone={() => setYazdiriliyor(false)}
          onReady={async () => {
            if (basildi.current) return;
            basildi.current = true;
            await yazdirmaAc(platform, { name: baseOf(dosya.ad), page: { width: inc(baskiBoyutu.w), height: inc(baskiBoyutu.h) } });
          }}
        />
      )}
      {gosteri && (
        <Gosteri
          pres={pres}
          start={gosteri.start}
          onExit={(i) => {
            setGosteri(null);
            if (i >= 0 && i < a.s.pres.slides.length) git(i);
          }}
        />
      )}
    </div>
  );
}
