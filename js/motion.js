/* 動きカタログ（01 くるくる回転木馬・14 動きとめるボタン）を、ファイルを直接開いても動く形にまとめたもの */
(function(){
/*
 * 動きカタログの共通部分。
 * ルール：動きは時間ではなく「スクロール量（0〜1）」で決める。
 * 止めれば止まり、戻せば同じ見た目に戻る。
 */

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const mix = (a, b, t) => a + (b - a) * t;
/** なめらかな加速・減速（smoothstep） */
const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
/** 少し行きすぎて戻る（ぴょこっと出る動き用） */
const easeOutBack = (t) => {
  t = clamp(t);
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/** 要素が画面の下端に入ったとき0、上端を抜けたとき1 */
function progressThrough(rectTop, rectHeight, viewH) {
  return clamp((viewH - rectTop) / Math.max(1, rectHeight + viewH));
}

/** 縦に長い区画の中でステージを sticky で固定したとき、その中の進み具合 */
function progressSticky(rectTop, rectHeight, stageH) {
  const distance = rectHeight - stageH;
  if (distance <= 0) return rectTop < 0 ? 1 : 0;
  return clamp(-rectTop / distance);
}

/** 前回と同じ値なら書き込まない（毎フレームのムダな書き換えを防ぐ） */
function createWriter() {
  const cache = new WeakMap();
  return (el, prop, value) => {
    let memo = cache.get(el);
    if (!memo) { memo = {}; cache.set(el, memo); }
    if (memo[prop] === value) return;
    memo[prop] = value;
    if (prop.startsWith('--')) el.style.setProperty(prop, value);
    else el.style[prop] = value;
  };
}

const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
/** 動きを止めるか：OSの「視差効果を減らす」設定、または 14 動きとめるボタン（html[data-motion=off]） */
//   data-motion="off" → 止める／"on" → OSの設定より優先して動かす／なし → OSの設定に従う
const prefersReduced = () => {
  const choice = globalThis.document?.documentElement?.dataset?.motion;
  if (choice === 'off') return true;
  if (choice === 'on') return false;
  return Boolean(reducedQuery?.matches);
};

/* 登録された render を、スクロール・リサイズのたびに1フレーム1回だけ呼ぶ */
const renders = new Set();
let frame = 0;
let listening = false;
function flush() { frame = 0; renders.forEach((r) => r()); }
function scheduleAll() { if (!frame && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(flush); }
function listen() {
  if (listening || typeof addEventListener !== 'function') return;
  listening = true;
  addEventListener('scroll', scheduleAll, { passive: true });
  addEventListener('resize', scheduleAll, { passive: true });
  addEventListener('pageshow', scheduleAll);
  globalThis.visualViewport?.addEventListener('resize', scheduleAll, { passive: true });
  reducedQuery?.addEventListener?.('change', scheduleAll);
  addEventListener('motion-toggle', scheduleAll); // 14 動きとめるボタンが押されたとき
  globalThis.document?.fonts?.ready.then(scheduleAll);
  if (typeof document !== 'undefined') document.documentElement.classList.add('js');
}

function onFrame(render) {
  renders.add(render);
  listen();
  scheduleAll();
  return {
    schedule: scheduleAll,
    destroy() { renders.delete(render); },
  };
}
/*
 * 01 くるくる回転木馬
 * スクロールで3〜5個の主役が楕円の上を回って入れ替わる。
 * 背景色・大きな英字・キャプション・横切る小物はあれば動かす（なくても動く）。
 */

const hexToRgb = (c) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c.trim());
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [238, 238, 238];
};

/**
 * @param {Element} root  data-motion-root を付けた section
 * @param {{hold?: number, colors?: string[], onPose?: (i:number, s:object)=>void}} options
 */
function initKurukuru(root, options = {}) {
  const hold = options.hold ?? 0.55; // 1つの主役の区間のうち、止まって見せる割合
  const stage = root.querySelector('.kurukuru-stage');
  const items = [...root.querySelectorAll('[data-kurukuru-item]')];
  const N = items.length;
  if (!stage || N < 2) return { render() {}, destroy() {} };
  root.style.setProperty('--n', String(N));

  const write = createWriter();
  const colors = (options.colors || items.map((el) => el.dataset.color || '#eeeeee')).map(hexToRgb);
  const captions = [...root.querySelectorAll('[data-kurukuru-caption]')];
  const sweeps = [...root.querySelectorAll('[data-kurukuru-sweep] > *')];
  const words = root.querySelector('[data-kurukuru-words]');
  const wordEls = [];
  if (words) {
    words.innerHTML = '';
    items.forEach((el) => {
      const w = document.createElement('p');
      w.className = 'kurukuru-word';
      w.textContent = el.dataset.word || '';
      words.append(w);
      wordEls.push(w);
    });
  }
  const dotsBox = root.querySelector('[data-kurukuru-dots]');
  const dots = [];
  if (dotsBox) {
    dotsBox.innerHTML = '';
    items.forEach((el, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', el.dataset.label || `${i + 1}番目`);
      b.addEventListener('click', () => goTo(i));
      dotsBox.append(b);
      dots.push(b);
    });
  }
  root.querySelector('[data-kurukuru-prev]')?.addEventListener('click', () => goTo(active - 1));
  root.querySelector('[data-kurukuru-next]')?.addEventListener('click', () => goTo(active + 1));

  // 本格段階：主役の中に video[data-scrub] があれば、その主役の区間でコマ送りする
  const scrubs = items.map((el) => {
    const video = el.querySelector('video[data-scrub]');
    return null;
  });

  let manual = 0; // 動きを減らす設定のときだけ使う
  let active = -1;

  // 楕円の上の位置。角度0で正面中央
  function pose(i, center, W, H, mobile) {
    const phase = (i - center) * (Math.PI * 2 / N);
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const depth = (1 + c) / 2;
    const scale = 0.32 + 0.68 * Math.pow(depth, 2.2);
    const backShift = clamp((-c - 0.7) / 0.3); // 真後ろの1体だけ、主役に隠れないよう左上へ
    return {
      // PCは左下に説明文を置くので、全体を少し右へ寄せる
      x: W * ((mobile ? 0.3 : 0.25) * s + (mobile ? 0 : 0.1) - (mobile ? 0.16 : 0.2) * backShift),
      y: -H * (mobile ? 0.13 : 0.22) * (1 - depth) - H * 0.04 * backShift,
      scale,
      blur: ((1 - depth) * (mobile ? 2.5 : 4)) / scale,
      opacity: 0.55 + 0.45 * depth,
      depth,
    };
  }

  function setActive(i) {
    if (i === active) return;
    active = i;
    dots.forEach((d, j) => d.setAttribute('aria-pressed', String(i === j)));
    captions.forEach((cap, j) => cap.setAttribute('aria-hidden', String(i !== j)));
    root.dataset.active = String(i);
  }

  function render() {
    const rect = root.getBoundingClientRect();
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const mobile = W <= 760;
    const reduced = prefersReduced();
    const t = reduced ? manual : progressSticky(rect.top, rect.height, H) * N * 0.9999;
    const k = Math.min(N - 1, Math.floor(t));
    const f = t - k;
    const turning = !reduced && k < N - 1 ? ease((f - hold) / (1 - hold)) : 0;
    const center = reduced ? manual : k + turning;
    const current = Math.round(center);
    setActive(current);

    // 背景色：今と次のあいだを補間
    const from = Math.floor(center);
    const to = Math.min(N - 1, from + 1);
    const rgb = colors[from].map((v, j) => Math.round(mix(v, colors[to][j], center - from)));
    write(stage, '--kurukuru-bg', `rgb(${rgb.join(',')})`);

    const gap = Math.abs(center - current);
    captions.forEach((cap, i) => write(cap, 'opacity', i === current ? clamp(1 - gap * 4).toFixed(3) : '0'));

    const moving = turning > 0 && turning < 1;
    items.forEach((el, i) => {
      if (wordEls[i]) {
        const near = clamp(1 - Math.abs(center - i) * 1.6);
        const drift = (i - center) * W * 0.6 - (t - i) * W * 0.04;
        write(wordEls[i], 'opacity', (near * 0.5).toFixed(3));
        write(wordEls[i], 'visibility', near > 0 ? 'visible' : 'hidden'); // 画面の外の飾り文字は隠す（はみ出しとして数えないため）
        write(wordEls[i], 'transform', `translateX(calc(-50% + ${drift.toFixed(1)}px))`);
      }
      const p = pose(i, center, W, H, mobile);
      // 移動中は小さく弾ませる（画像だけでも「歩いて」見える）
      const hop = moving && !reduced ? Math.abs(Math.sin(t * Math.PI * 14)) * 8 : 0;
      write(el, 'transform', `translate(-50%,0) translate(${p.x.toFixed(1)}px,${(p.y - hop).toFixed(1)}px) scale(${p.scale.toFixed(3)})`);
      write(el, 'filter', p.blur > 0.05 ? `blur(${p.blur.toFixed(2)}px)` : 'none');
      write(el, 'opacity', p.opacity.toFixed(3));
      write(el, 'zIndex', String(Math.round(p.scale * 100)));
      // 2ポーズ画像があれば、移動中に交互に出す（もう一段）
      const step = Math.floor(t * 28) % 2;
      el.querySelectorAll('[data-pose]').forEach((img) => {
        const want = moving && !reduced ? (img.dataset.pose === (step ? 'b' : 'a')) : img.dataset.pose === 'a';
        write(img, 'visibility', want ? 'visible' : 'hidden');
      });
      if (scrubs[i]) {
        const visible = rect.bottom > 0 && rect.top < innerHeight;
        // 自分の区間（t が i〜i+1）で 0→1。正面とその次だけ読み込む
        scrubs[i].update(clamp(t - i), visible && !reduced && (i === current || i === (current + 1) % N));
      }
      options.onPose?.(i, {
        moving: moving && !reduced, step, t, reduced,
        front: i === current, depth: p.depth, holdProgress: clamp(f / hold),
      });
    });

    // 切り替わりの瞬間、次の主役の小物が画面を横切る
    sweeps.forEach((el, i) => {
      const s = !reduced && i === k + 1 && k < N - 1 ? clamp((f - hold) / (1 - hold)) : 0;
      const on = s > 0 && s < 1;
      write(el, 'opacity', on ? (ease(s / 0.12) * ease((1 - s) / 0.12)).toFixed(3) : '0');
      // 見えていない間も位置を書く（見た目がスクロール位置だけで決まるように）
      const x = mix(0.75, -0.75, s) * W;
      const y = -Math.sin(s * Math.PI) * H * 0.18;
      write(el, 'transform', `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(-s * 540).toFixed(1)}deg)`);
    });
  }

  function goTo(i) {
    i = (i + N) % N;
    if (prefersReduced()) { manual = i; handle.schedule(); return; }
    const top = root.getBoundingClientRect().top + scrollY;
    const distance = root.offsetHeight - stage.clientHeight;
    scrollTo({ top: top + (distance * (i + 0.12)) / N, behavior: 'smooth' });
  }

  const handle = onFrame(render);
  return { render, destroy: handle.destroy };
}
/*
 * 14 動きとめるボタン
 * 見る人が「動きをとめる／うごかす」を自分で切りかえられるボタン。選んだ状態はブラウザが覚えておく。
 * 止めると html に data-motion="off"、動かすと data-motion="on" が付く。
 * ・まだ一度も押していない人は、パソコンやスマホの「視差効果を減らす」設定に合わせて始まる
 * ・押して「on」にした人は、その設定より優先して動く（このカタログの部品は全部これに従う）
 * ちらつかないよう、<head> にも小さなスクリプトを入れる（part.html を参照）。
 */

/**
 * @param {HTMLButtonElement} button  data-motion-toggle。中の [data-motion-label] の文字が切りかわる
 * @param {{key?: string}} options  key: 覚えておく名前（既定 'motion-off'。<head> のスクリプトと同じにする）
 */
function initTomeru(button, options = {}) {
  const key = options.key ?? 'motion-off';
  const root = document.documentElement;
  const label = button.querySelector('[data-motion-label]') || button;
  let saved = null;
  try { saved = localStorage.getItem(key); } catch {}
  const osReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let off = saved === null ? osReduced : saved === '1';

  function apply() {
    root.dataset.motion = off ? 'off' : 'on';
    button.setAttribute('aria-pressed', String(off));
    label.textContent = off ? (button.dataset.labelOff || '動きをうごかす') : (button.dataset.labelOn || '動きをとめる');
    // 押して出る動き（Web Animations）も止める
    if (off) document.getAnimations?.().forEach((a) => { if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish?.(); });
    dispatchEvent(new Event('motion-toggle'));
  }
  button.addEventListener('click', () => {
    off = !off;
    try { localStorage.setItem(key, off ? '1' : '0'); } catch {}
    apply();
  });
  apply();
  return { render() {}, destroy() {} };
}

/** <head> に入れる小さなスクリプト（文字列）。part.html と同じ中身 */
/* 05 下からクーポン（動きカタログの part.js を、ふつうのスクリプト用に書きかえ） */
function initShitaCoupon(dialog, options = {}) {
  const delay = options.delay ?? 1200;
  const key = options.key ?? 'motion-coupon-seen';
  const hash = options.hash ?? '#coupon';
  const read = () => { try { return sessionStorage.getItem(key) === '1'; } catch { return false; } };
  const remember = () => { try { sessionStorage.setItem(key, '1'); } catch {} };
  const open = () => { if (!dialog.open && !document.querySelector('dialog[open]')) dialog.showModal(); remember(); };
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.querySelectorAll('[data-open-coupon]').forEach((b) => b.addEventListener('click', open));
  const fromHash = () => { if (location.hash === hash) open(); };
  addEventListener('hashchange', fromHash);
  let timer = 0;
  if (location.hash === hash) fromHash();
  else if (!read()) timer = setTimeout(open, delay);
  return { render() {}, destroy() { clearTimeout(timer); removeEventListener('hashchange', fromHash); } };
}

window.LuluMotion={initKurukuru:initKurukuru,initTomeru:initTomeru,initShitaCoupon:initShitaCoupon};
})();
