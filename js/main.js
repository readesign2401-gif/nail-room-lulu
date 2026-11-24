/* nail room lulu — 予約の文づくり・動きの初期化 */
(function () {
  'use strict';

  /* ===== 本番で書きかえるところ ===== */
  // 公式LINEのID（@から始まる）。空のままだと「見本」として動き、LINEは開かない
  var LINE_ID = '';
  var SHOP = 'nail room lulu';

  /* ===== 動き（動きとめるボタンを先に） ===== */
  var M = window.LuluMotion;
  var toggle = document.querySelector('[data-motion-toggle]');
  if (M && toggle) M.initTomeru(toggle);
  var design = document.querySelector('.kurukuru');
  // 上左・下右の英語の名前：正面のデザインが変わったら入れかえる
  var names = design ? [].slice.call(design.querySelectorAll('[data-design-name]')) : [];
  var items = design ? [].slice.call(design.querySelectorAll('[data-kurukuru-item]')) : [];
  var shownName = -1;
  var onPose = function (i, s) {
    if (!s.front || i === shownName || !names.length) return;
    shownName = i;
    names.forEach(function (el) {
      el.textContent = items[i].getAttribute('data-en');
      el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in');
    });
  };
  if (M && design) M.initKurukuru(design, { hold: 0.5, onPose: onPose });

  /* ===== 当日の流れ：リボンがスクロールで 5分→15分→… と下へおりる ===== */
  (function () {
  var flowWrap = document.querySelector('[data-flow-ribbon]');
  if (flowWrap) {
    var ribbon = flowWrap.querySelector('.flow-ribbon');
    var rows = [].slice.call(flowWrap.querySelectorAll('.flow-list li'));
    var times = rows.map(function (li) { return li.querySelector('.flow-time'); });
    var clamp01 = function (v) { return Math.max(0, Math.min(1, v)); };
    var easeIO = function (v) { return v < .5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2; };
    var still = function () {
      var h = document.documentElement;
      if (h.dataset.motion === 'off') return true;
      if (h.dataset.motion === 'on') return false;
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    };
    var nowRow = -1, ticking = false;
    var place = function () {
      ticking = false;
      var w = flowWrap.getBoundingClientRect();
      var pts = times.map(function (t) {
        var r = t.getBoundingClientRect();
        return { x: r.left + r.width / 2 - w.left, y: r.top - w.top };
      });
      var n = pts.length;
      flowWrap.style.setProperty('--line-x', pts[0].x + 'px');
      flowWrap.style.setProperty('--line-top', pts[0].y + 'px');
      flowWrap.style.setProperty('--line-h', (pts[n - 1].y - pts[0].y) + 'px');
      // 画面の6割の高さを「いまの場所」にして、0〜(n-1) の進み具合を出す
      var anchor = innerHeight * 0.6 - w.top;
      var t = 0;
      for (var i = 0; i < n - 1; i++) {
        if (anchor >= pts[i + 1].y) { t = i + 1; continue; }
        if (anchor > pts[i].y) t = i + (anchor - pts[i].y) / (pts[i + 1].y - pts[i].y);
        break;
      }
      var k = Math.min(n - 1, Math.floor(t));
      var f = t - k;
      // それぞれの時間の丸でいったん止まってから、次へすべりおりる
      var move = still() ? (f >= .5 ? 1 : 0) : easeIO(clamp01((f - .35) / .65));
      var a = pts[k], b = pts[Math.min(n - 1, k + 1)];
      var x = a.x + (b.x - a.x) * move;
      var y = a.y + (b.y - a.y) * move;
      var rw = ribbon.getBoundingClientRect().width, rh = ribbon.getBoundingClientRect().height;
      ribbon.style.transform = 'translate(' + (x - rw / 2).toFixed(1) + 'px,' + (y - rh * 0.8).toFixed(1) + 'px)';
      var cur = Math.round(k + move);
      if (cur !== nowRow) {
        nowRow = cur;
        rows.forEach(function (li, j) { li.classList.toggle('is-now', j === cur); });
      }
    };
    var ask = function () { if (!ticking) { ticking = true; requestAnimationFrame(place); } };
    addEventListener('scroll', ask, { passive: true });
    addEventListener('resize', ask);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ask);
    addEventListener('load', ask);
    ask();
  }
  })();

  /* ===== 下からクーポン（開いて1.5秒後、はじめての1回だけ） ===== */
  var coupon = document.querySelector('.shita-coupon');
  if (M && coupon && M.initShitaCoupon) {
    M.initShitaCoupon(coupon, { delay: 1500, key: 'lulu-coupon-seen' });
    var use = coupon.querySelector('[data-coupon-use]');
    if (use) use.addEventListener('click', function () {
      coupon.close();
      var f = document.getElementById('rv-first');
      if (f && !f.checked) { f.checked = true; f.dispatchEvent(new Event('change')); }
    });
  }

  /* ===== 下の追従ボタン：最初の画面を過ぎたら出し、予約の場所では隠す ===== */
  var fixed = document.querySelector('.fixed-cta');
  var fv = document.querySelector('.fv');
  var reserve = document.getElementById('reserve');
  if (fixed && 'IntersectionObserver' in window) {
    var pastFv = false, atReserve = false, atDesign = false;
    var update = function () { fixed.classList.toggle('is-show', pastFv && !atReserve && !atDesign); };
    // デザインメニュー（くるくる）の中では、説明と重ならないよう隠す
    new IntersectionObserver(function (e) { atDesign = e[0].isIntersecting; update(); }, { rootMargin: '-10% 0px -10% 0px' }).observe(design);
    new IntersectionObserver(function (e) { pastFv = !e[0].isIntersecting; update(); }).observe(fv);
    new IntersectionObserver(function (e) { atReserve = e[0].isIntersecting; update(); }, { rootMargin: '0px 0px -20% 0px' }).observe(reserve);
  }

  /* ===== 予約の選択肢 ===== */
  var menus = [
    { v: 'えらべる定額（7,700円）', main: 'えらべる定額', sub: '7,700円' },
    { v: 'こだわり定額（9,900円）', main: 'こだわり定額', sub: '9,900円' },
    { v: 'ワンカラー（5,500円）', main: 'ワンカラー', sub: '5,500円' }
  ];
  var designs = ['ミルキーピンクニュアンス', 'ミルキーホワイト＆パール', 'ちいさなリボン', 'ローズマグネット', 'ピンクフレンチ', '当日相談したい'];
  var times = ['10:00', '12:30', '13:00', '15:00', '17:30', '19:00'];
  var week = ['日', '月', '火', '水', '木', '金', '土'];

  // 見本の空き状況：明日から8日分のうち、休みの曜日（火）を除いて4日。満席は決まった並びで見せる
  var dates = [];
  var d = new Date(); d.setHours(0, 0, 0, 0);
  for (var i = 1; dates.length < 4 && i < 14; i++) {
    var x = new Date(d); x.setDate(d.getDate() + i);
    if (x.getDay() === 2) continue;
    dates.push(x);
  }
  var fullDate = 3;            // 4つ目の日は満席（見本）
  var fullTimes = [2, 4];      // 13:00 と 17:30 は満席（見本）

  var state = { menu: 0, date: 0, time: 0, design: -1 };

  function makeBtn(main, sub, pressed, disabled) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rv-opt';
    b.setAttribute('aria-pressed', String(!!pressed));
    var m = document.createElement('span'); m.className = 'rv-main'; m.textContent = main; b.append(m);
    if (sub) { var s = document.createElement('small'); s.textContent = sub; b.append(s); }
    if (disabled) { b.disabled = true; var f = document.createElement('small'); f.textContent = '満席'; b.append(f); b.setAttribute('aria-label', main + '（満席）'); }
    return b;
  }

  function fill(group, items, key) {
    var box = document.querySelector('[data-group="' + group + '"]');
    if (!box) return;
    box.innerHTML = '';
    items.forEach(function (it, idx) {
      var b = makeBtn(it.main, it.sub, state[key] === idx, it.disabled);
      b.addEventListener('click', function () {
        state[key] = (key === 'design' && state[key] === idx) ? -1 : idx;
        [].forEach.call(box.children, function (c, j) { c.setAttribute('aria-pressed', String(state[key] === j)); });
        render();
      });
      box.append(b);
    });
  }

  fill('menu', menus, 'menu');
  fill('date', dates.map(function (x, j) {
    return { main: (x.getMonth() + 1) + '/' + x.getDate(), sub: week[x.getDay()], disabled: j === fullDate };
  }), 'date');
  fill('time', times.map(function (t, j) { return { main: t, disabled: fullTimes.indexOf(j) >= 0 }; }), 'time');
  fill('design', designs.map(function (n) { return { main: n }; }), 'design');

  var out = document.getElementById('rv-text');
  var first = document.getElementById('rv-first');
  var nameInput = document.getElementById('rv-name');
  var status = document.getElementById('rv-status');

  function text() {
    var x = dates[state.date];
    var lines = [
      SHOP + ' の予約希望です。',
      'メニュー：' + menus[state.menu].v,
      '日にち：' + (x.getMonth() + 1) + '月' + x.getDate() + '日（' + week[x.getDay()] + '）',
      '時間：' + times[state.time] + '〜',
      'はじめて：' + (first.checked ? 'はい（1,000円引き）' : 'いいえ'),
      'お名前：' + (nameInput.value.trim() || ''),
      'デザインの希望：' + (state.design >= 0 ? designs[state.design] : '')
    ];
    return lines.join('\n');
  }
  function render() { out.textContent = text(); status.textContent = ''; }
  first.addEventListener('change', render);
  nameInput.addEventListener('input', render);
  render();

  /* ===== コピー ===== */
  function copy() {
    var t = text();
    var done = function () {
      var b = document.getElementById('rv-copy');
      b.textContent = 'コピーしました';
      b.classList.add('is-done');
      status.textContent = '文をコピーしました。LINEのトークに貼りつけて送ってください。';
      setTimeout(function () { b.textContent = 'コピーする'; b.classList.remove('is-done'); }, 2400);
    };
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(t).then(done, function () { fallback(t); done(); });
    }
    fallback(t); done();
    return Promise.resolve();
  }
  function fallback(t) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  document.getElementById('rv-copy').addEventListener('click', copy);

  /* ===== LINEを開く ===== */
  document.getElementById('rv-line').addEventListener('click', function () {
    if (!LINE_ID) {
      copy().then(function () {
        status.textContent = 'これは見本のため、LINEは開きません。本番では、この文が入った状態でお店のLINEが開きます（文はコピー済みです）。';
      });
      return;
    }
    var url = 'https://line.me/R/oaMessage/' + encodeURIComponent(LINE_ID) + '/?' + encodeURIComponent(text());
    copy();
    window.location.href = url;
  });
})();
