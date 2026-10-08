const $ = (id) => document.getElementById(id);
const labels = {
  ACTIVE: 'Đang diễn ra',
  COMPLETED: 'Hoàn thành',
  FAILED: 'Thất bại',
  PENDING: 'Đang chờ',
  PROCESSING: 'Đang xử lý',
};
const state = { view: 'overview', page: 1, search: '', status: '', request: 0 };
const date = (value) => (value ? new Date(value).toLocaleString('vi-VN') : '—');
const number = (value) => Number(value || 0).toLocaleString('vi-VN');
function el(tag, text, className) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
}
function badge(status) {
  return el(
    'span',
    labels[status] || status || 'Chưa có',
    'badge ' + (status || ''),
  );
}
function showLogin() {
  state.request++;
  $('dashboard').hidden = true;
  $('login').hidden = false;
  $('content').replaceChildren();
  $('detail').close();
  $('detail-content').replaceChildren();
  $('password').focus();
}
async function api(path, body) {
  const response = await fetch('/admin/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'x-dashboard-request': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 401 && path !== 'login') showLogin();
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.message === 'string'
        ? data.message
        : 'Không thể tải dữ liệu. Hãy thử lại.',
    );
  return data;
}
function panel(title, subtitle) {
  const p = el('section', undefined, 'panel');
  const h = el('div', undefined, 'panel-head');
  const t = el('div');
  t.append(el('h2', title));
  if (subtitle) t.append(el('p', subtitle));
  h.append(t);
  p.append(h);
  return p;
}
function table(headers, rows) {
  const wrap = el('div', undefined, 'table-scroll');
  const t = el('table');
  const head = el('tr');
  headers.forEach((v) => head.append(el('th', v)));
  const th = el('thead');
  th.append(head);
  t.append(th);
  const body = el('tbody');
  rows.forEach((cells) => {
    const row = el('tr');
    cells.forEach((v) => {
      const td = el('td');
      td.append(
        v instanceof Node ? v : document.createTextNode(String(v ?? '—')),
      );
      row.append(td);
    });
    body.append(row);
  });
  t.append(body);
  wrap.append(t);
  if (!rows.length) wrap.append(el('p', 'Chưa có dữ liệu phù hợp.', 'empty'));
  return wrap;
}
function userCell(user) {
  const cell = el('div', user.name);
  cell.append(el('small', user.email));
  return cell;
}
function sessionsTable(items) {
  return table(
    ['NGƯỜI HỌC', 'BẮT ĐẦU', 'THỜI LƯỢNG', 'TRẠNG THÁI', 'PHÂN TÍCH', ''],
    items.map((s) => {
      const button = el('button', 'Chi tiết →', 'link');
      button.onclick = () => showSession(s.id);
      return [
        userCell(s.user),
        date(s.startedAt),
        s.durationSeconds == null
          ? '—'
          : Math.round(s.durationSeconds / 60) + ' phút',
        badge(s.status),
        badge(s.analysis?.status),
        button,
      ];
    }),
  );
}
function overview(data) {
  const frag = document.createDocumentFragment();
  const cards = el('div', undefined, 'cards');
  [
    ['Người dùng', data.users, 'Tổng tài khoản đã đăng ký'],
    [
      'Phiên học',
      data.sessions,
      number(data.lastWeek) + ' phiên trong 7 ngày qua',
    ],
    ['Phút luyện tập', data.minutes, 'Tổng thời lượng được ghi nhận'],
    [
      'Phân tích lỗi',
      data.failedAnalyses,
      number(data.active) + ' phiên đang diễn ra',
    ],
  ].forEach(([title, value, hint]) => {
    const card = el('div', undefined, 'card');
    card.append(
      el('div', title, 'card-label'),
      el('div', number(value), 'card-value'),
      el('div', hint, 'card-hint'),
    );
    cards.append(card);
  });
  frag.append(cards);
  const recent = panel('Hoạt động gần đây', '8 phiên học mới nhất');
  recent.append(sessionsTable(data.recent));
  frag.append(recent);
  const server = panel(
    'Cấu hình dịch vụ',
    'Trạng thái cấu hình hiện tại · không hiển thị khóa bí mật',
  );
  const grid = el('div', undefined, 'server-grid');
  [
    ['Database', 'Đã kết nối'],
    ['Nhà cung cấp', data.server.provider],
    [
      'Gemini API key',
      data.server.geminiConfigured ? 'Đã cấu hình' : 'Chưa cấu hình',
    ],
    ['Mô hình hội thoại Gemini', data.server.liveModel],
    ['Mô hình phân tích Gemini', data.server.analysisModel],
    [
      'OpenAI API key',
      data.server.openaiConfigured ? 'Đã cấu hình' : 'Chưa cấu hình',
    ],
  ].forEach(([title, value]) => {
    const cell = el('div');
    cell.append(el('span', title), el('strong', value));
    grid.append(cell);
  });
  server.append(grid);
  frag.append(server);
  return frag;
}
function keySettings(data) {
  const frag = document.createDocumentFragment();
  const intro = el(
    'p',
    'Cập nhật key cho các yêu cầu mới ngay sau khi lưu. Không cần khởi động lại server hoặc build lại APK.',
    'muted',
  );
  frag.append(intro);
  if (
    location.protocol === 'http:' &&
    !['localhost', '127.0.0.1'].includes(location.hostname)
  ) {
    frag.append(
      el(
        'p',
        'Trang hiện dùng HTTP, chưa mã hóa đường truyền. Có thể mở qua SSH tunnel khi nhập key.',
        'notice',
      ),
    );
  }
  if (!data.writable)
    frag.append(
      el('p', 'Chưa thể lưu: server chưa cấu hình khóa mã hóa.', 'notice'),
    );
  data.providers.forEach((item) => {
    const name = item.provider === 'gemini' ? 'Gemini' : 'OpenAI';
    const box = panel(
      name + ' API key',
      item.provider === 'gemini'
        ? 'Hội thoại Gemini Live và phân tích sau phiên học'
        : 'Dịch vụ OpenAI Realtime',
    );
    const form = el('form', undefined, 'key-form');
    const meta = el('div', undefined, 'key-meta');
    meta.append(
      badge(item.configured ? 'COMPLETED' : null),
      el(
        'span',
        item.configured ? 'Key đã được cấu hình ••••••••' : 'Chưa có API key',
      ),
    );
    // Use provider-specific status labels instead of session labels.
    meta.firstChild.textContent = item.configured
      ? 'Đã cấu hình'
      : 'Chưa cấu hình';
    form.append(
      meta,
      el(
        'p',
        'Nguồn: ' +
          (item.source === 'dashboard' ? 'Dashboard' : 'Cấu hình VPS') +
          (item.updatedAt ? ' · Cập nhật ' + date(item.updatedAt) : ''),
        'muted',
      ),
    );
    const label = el('label', name + ' API key mới');
    label.htmlFor = 'key-' + item.provider;
    const input = el('input');
    input.id = label.htmlFor;
    input.type = 'password';
    input.autocomplete = 'new-password';
    input.spellcheck = false;
    input.minLength = 20;
    input.maxLength = 512;
    input.required = true;
    input.placeholder = 'Nhập key mới để thay thế';
    input.disabled = !data.writable;
    const hint = el(
      'p',
      'Key đã lưu không được hiển thị lại. Để trống nếu không muốn thay đổi.',
      'key-hint',
    );
    const actions = el('div', undefined, 'key-actions');
    const save = el('button', 'Lưu ' + name + ' key', 'primary');
    save.disabled = !data.writable;
    const test = el('button', 'Kiểm tra key đang dùng');
    test.type = 'button';
    test.disabled = !item.configured;
    const reset = el('button', 'Dùng lại cấu hình VPS');
    reset.type = 'button';
    reset.disabled = item.source !== 'dashboard';
    const message = el('p', '', 'key-result');
    message.setAttribute('role', 'status');
    const busy = (value) => {
      input.disabled = value || !data.writable;
      save.disabled = value || !data.writable;
      test.disabled = value || !item.configured;
      reset.disabled = value || item.source !== 'dashboard';
    };
    const apply = (result) => {
      if (state.view === 'keys' && !$('dashboard').hidden) {
        $('content').replaceChildren(keySettings(result));
        $('notice').textContent =
          'Đã cập nhật cấu hình ' +
          name +
          '. Các yêu cầu mới sẽ dùng key hiện tại.';
      }
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      busy(true);
      message.textContent = 'Đang lưu…';
      try {
        const result = await api('api/keys', {
          provider: item.provider,
          key: input.value.trim(),
        });
        input.value = '';
        apply(result);
      } catch (error) {
        message.textContent = error.message;
      } finally {
        busy(false);
      }
    };
    test.onclick = async () => {
      busy(true);
      message.textContent = 'Đang kiểm tra kết nối…';
      try {
        const result = await api('api/keys/test', { provider: item.provider });
        message.textContent = result.message;
        message.classList.toggle('error', !result.ok);
      } catch (error) {
        message.textContent = error.message;
      } finally {
        busy(false);
      }
    };
    reset.onclick = async () => {
      if (
        !confirm(
          item.fallbackConfigured
            ? 'Bỏ key lưu trên dashboard và dùng lại key từ cấu hình VPS?'
            : 'VPS không có key dự phòng. Thao tác này sẽ tắt kết nối ' +
                name +
                '. Tiếp tục?',
        )
      )
        return;
      busy(true);
      try {
        apply(await api('api/keys/reset', { provider: item.provider }));
      } catch (error) {
        message.textContent = error.message;
      } finally {
        busy(false);
      }
    };
    actions.append(save, test, reset);
    form.append(label, input, hint, actions, message);
    box.append(form);
    frag.append(box);
  });
  return frag;
}
function listing(data) {
  const p = panel(
    state.view === 'users' ? 'Danh sách người dùng' : 'Lịch sử phiên học',
    number(data.total) + ' kết quả',
  );
  const form = el('form', undefined, 'filters');
  const input = el('input');
  input.placeholder = 'Tìm theo tên hoặc email…';
  input.setAttribute('aria-label', 'Tìm theo tên hoặc email');
  input.value = state.search;
  form.append(input);
  const select = el('select');
  select.setAttribute('aria-label', 'Trạng thái phiên học');
  [
    ['', 'Tất cả trạng thái'],
    ['ACTIVE', labels.ACTIVE],
    ['COMPLETED', labels.COMPLETED],
    ['FAILED', labels.FAILED],
  ].forEach(([value, title]) => {
    const option = el('option', title);
    option.value = value;
    select.append(option);
  });
  select.value = state.status;
  if (state.view === 'sessions') form.append(select);
  form.append(el('button', 'Tìm kiếm'));
  form.onsubmit = (e) => {
    e.preventDefault();
    state.search = input.value.trim();
    state.status = select.value;
    state.page = 1;
    load();
  };
  p.append(form);
  p.append(
    state.view === 'users'
      ? table(
          ['NGƯỜI DÙNG', 'TRÌNH ĐỘ', 'CHẾ ĐỘ', 'PHIÊN HỌC', 'NGÀY THAM GIA'],
          data.items.map((u) => [
            userCell(u),
            u.profile?.level || '—',
            u.profile?.languageMode || '—',
            number(u._count.sessions),
            date(u.createdAt),
          ]),
        )
      : sessionsTable(data.items),
  );
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const pager = el('div', undefined, 'pager');
  const prev = el('button', '← Trước');
  prev.disabled = data.page <= 1;
  prev.onclick = () => {
    state.page--;
    load();
  };
  const next = el('button', 'Sau →');
  next.disabled = data.page >= pages;
  next.onclick = () => {
    state.page++;
    load();
  };
  pager.append(el('span', 'Trang ' + data.page + ' / ' + pages), prev, next);
  p.append(pager);
  return p;
}
async function load() {
  const request = ++state.request;
  $('notice').textContent = 'Đang tải dữ liệu…';
  $('refresh').disabled = true;
  $('page-title').textContent = {
    overview: 'Tổng quan',
    keys: 'Cấu hình API key',
    users: 'Người dùng',
    sessions: 'Phiên học',
  }[state.view];
  document
    .querySelectorAll('[data-view]')
    .forEach((b) =>
      b.classList.toggle('selected', b.dataset.view === state.view),
    );
  try {
    const data = await api(
      'api/' +
        state.view +
        (['overview', 'keys'].includes(state.view)
          ? ''
          : '?' +
            new URLSearchParams({
              page: state.page,
              search: state.search,
              status: state.status,
            })),
    );
    if (request !== state.request) return;
    $('login').hidden = true;
    $('dashboard').hidden = false;
    $('content').replaceChildren(
      state.view === 'overview'
        ? overview(data)
        : state.view === 'keys'
          ? keySettings(data)
          : listing(data),
    );
    $('notice').textContent = '';
  } catch (error) {
    if (request === state.request) {
      $('notice').textContent = error.message;
      if ($('dashboard').hidden) {
        showLogin();
        $('login-error').textContent = error.message;
      }
    }
  } finally {
    $('refresh').disabled = false;
  }
}
async function showSession(id) {
  const dialog = $('detail');
  $('detail-content').textContent = 'Đang tải…';
  dialog.showModal();
  try {
    const s = await api('api/sessions/' + id);
    if (!dialog.open) return;
    const body = $('detail-content');
    body.replaceChildren(
      el('p', s.user.name + ' · ' + s.user.email, 'detail-meta'),
      el(
        'p',
        date(s.startedAt) +
          ' · ' +
          (s.provider || '—') +
          ' / ' +
          (s.model || '—'),
        'detail-meta',
      ),
      badge(s.status),
    );
    body.append(el('h2', 'Kết quả phân tích', 'section-title'));
    if (!s.analysis)
      body.append(el('p', 'Chưa có kết quả phân tích.', 'muted'));
    else {
      body.append(badge(s.analysis.status));
      if (s.analysis.errorMessage)
        body.append(el('p', s.analysis.errorMessage, 'notice'));
      if (s.analysis.summary) body.append(el('p', s.analysis.summary));
      const details = el('details');
      details.append(el('summary', 'Xem dữ liệu phân tích'));
      details.append(
        el(
          'pre',
          JSON.stringify(
            {
              topics: s.analysis.mainTopics,
              grammar: s.analysis.grammarIssues,
              vocabulary: s.analysis.newVocabulary,
              strengths: s.analysis.strengths,
              nextFocus: s.analysis.nextSessionFocus,
            },
            null,
            2,
          ),
          'analysis-data',
        ),
      );
      body.append(details);
    }
    body.append(el('h2', 'Nội dung hội thoại', 'section-title'));
    if (s._count.transcript > 500)
      body.append(
        el(
          'p',
          'Hiển thị 500 tin nhắn đầu tiên / ' + s._count.transcript,
          'muted',
        ),
      );
    if (!s.transcript.length)
      body.append(el('p', 'Phiên học chưa có transcript.', 'muted'));
    s.transcript.forEach((m) => {
      const box = el('div', undefined, 'transcript ' + m.role);
      box.append(
        el(
          'small',
          (m.role === 'USER' ? 'Người học' : 'Trợ lý') +
            ' · ' +
            date(m.occurredAt),
        ),
        document.createTextNode(m.content),
      );
      body.append(box);
    });
  } catch (error) {
    $('detail-content').textContent = error.message;
  }
}
$('login-form').onsubmit = async (e) => {
  e.preventDefault();
  const button = e.currentTarget.querySelector('button');
  button.disabled = true;
  $('login-error').textContent = '';
  try {
    await api('login', { password: $('password').value });
    $('password').value = '';
    await load();
  } catch (error) {
    $('login-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
document.querySelectorAll('[data-view]').forEach(
  (b) =>
    (b.onclick = () => {
      Object.assign(state, {
        view: b.dataset.view,
        page: 1,
        search: '',
        status: '',
      });
      load();
    }),
);
$('refresh').onclick = load;
$('logout').onclick = async () => {
  try {
    await api('logout', {});
    showLogin();
  } catch (error) {
    $('notice').textContent = error.message;
  }
};
$('close-detail').onclick = () => $('detail').close();
load();
