const state = {
  token: localStorage.getItem('pv_token'),
  user: JSON.parse(localStorage.getItem('pv_user') || 'null')
};

const $ = (selector) => document.querySelector(selector);

const API_BASE = 'https://potholevision-api.onrender.com';


// =========================
// API FUNCTION
// =========================

const api = async (path, options = {}) => {
  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...options.headers
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.detail || 'Request failed');
  }

  return body;
};


// =========================
// TOAST
// =========================

function toast(message) {
  const el = $('#toast');

  if (!el) return;

  el.textContent = message;
  el.classList.add('show');

  setTimeout(() => {
    el.classList.remove('show');
  }, 3000);
}


// =========================
// BADGE
// =========================

function badge(value) {
  return `
    <span class="badge ${String(value).toLowerCase()}">
      ${String(value).replaceAll('_', ' ')}
    </span>
  `;
}


// =========================
// USER
// =========================

function setUser() {
  const userName = $('#user-name');
  const authButton = $('#open-auth');

  if (userName) {
    userName.textContent =
      state.user ? state.user.name : 'Guest access';
  }

  if (authButton) {
    authButton.textContent =
      state.user ? 'Sign out' : 'Sign in';
  }
}


// =========================
// OVERVIEW
// =========================

async function loadOverview() {
  try {
    const data = await api('/analytics/summary');

    const status = data.potholes_by_status || {};

    if ($('#total-potholes')) {
      $('#total-potholes').textContent =
        data.potholes_total || 0;
    }

    if ($('#open-potholes')) {
      $('#open-potholes').textContent =
        (status.detected || 0) +
        (status.assigned || 0) +
        (status.in_progress || 0);
    }

    if ($('#total-orders')) {
      $('#total-orders').textContent =
        data.work_orders_total || 0;
    }

    if ($('#verified-potholes')) {
      $('#verified-potholes').textContent =
        status.verified || 0;
    }

    const values =
      data.potholes_by_severity || {};

    const max = Math.max(
      1,
      ...Object.values(values)
    );

    if ($('#severity-chart')) {
      $('#severity-chart').innerHTML =
        Object.keys(values).length
          ? Object.entries(values)
              .map(
                ([name, count]) => `
                  <div class="bar-row">
                    <span>${name}</span>

                    <div class="bar">
                      <i style="width:${count / max * 100}%"></i>
                    </div>

                    <b>${count}</b>
                  </div>
                `
              )
              .join('')
          : '<p class="muted">No severity data available.</p>';
    }

    if ($('#connection-label')) {
      $('#connection-label').textContent =
        'API online';
    }

  } catch (error) {

    if ($('#connection-label')) {
      $('#connection-label').textContent =
        'API unavailable';
    }

    console.error(
      'Overview error:',
      error
    );
  }
}


// =========================
// POTHOLES
// =========================

async function loadPotholes() {

  try {

    const rows =
      await api('/potholes');

    if ($('#pothole-rows')) {

      $('#pothole-rows').innerHTML =
        rows
          .map(
            p => `
              <tr>
                <td>#${p.id}</td>

                <td>
                  ${Number(p.latitude).toFixed(4)},
                  ${Number(p.longitude).toFixed(4)}
                </td>

                <td>
                  ${badge(p.severity)}
                </td>

                <td>
                  ${badge(p.priority)}
                </td>

                <td>
                  ${badge(p.status)}
                </td>
              </tr>
            `
          )
          .join('');
    }

    if ($('#pothole-empty')) {
      $('#pothole-empty').hidden =
        rows.length > 0;
    }

  } catch (error) {

    console.error(
      'Potholes error:',
      error
    );

    throw error;
  }
}


// =========================
// OPERATIONS
// =========================

async function loadOperations() {

  try {

    const [contractors, orders] =
      await Promise.all([
        api('/contractors'),
        api('/work-orders')
      ]);


    if ($('#contractor-rows')) {

      $('#contractor-rows').innerHTML =
        contractors
          .map(
            c => `
              <tr>
                <td>${c.name}</td>

                <td>${c.company}</td>

                <td>
                  ${c.email || c.phone || '-'}
                </td>

                <td>
                  ${badge(
                    c.active
                      ? 'active'
                      : 'inactive'
                  )}
                </td>
              </tr>
            `
          )
          .join('');
    }


    if ($('#contractor-empty')) {

      $('#contractor-empty').hidden =
        contractors.length > 0;
    }


    if ($('#order-rows')) {

      $('#order-rows').innerHTML =
        orders
          .map(
            o => `
              <tr>
                <td>#${o.id}</td>

                <td>#${o.pothole_id}</td>

                <td>
                  ${badge(o.priority)}
                </td>

                <td>
                  ${badge(o.status)}
                </td>
              </tr>
            `
          )
          .join('');
    }


    if ($('#order-empty')) {

      $('#order-empty').hidden =
        orders.length > 0;
    }

  } catch (error) {

    console.error(
      'Operations error:',
      error
    );

    throw error;
  }
}


// =========================
// REFRESH
// =========================

function refresh() {
  loadOverview();
  loadPotholes().catch(() => {});
  loadOperations().catch(() => {});
}


// =========================
// NAVIGATION
// =========================

document
  .querySelectorAll('.nav-item')
  .forEach(button => {

    button.addEventListener(
      'click',
      () => {

        document
          .querySelectorAll(
            '.nav-item,.view'
          )
          .forEach(el => {
            el.classList.remove('active');
          });

        button.classList.add('active');

        const view =
          $(`#${button.dataset.view}`);

        if (view) {
          view.classList.add('active');
        }

        if ($('#page-title')) {
          $('#page-title').textContent =
            button.textContent;
        }

        if ($('#section-label')) {
          $('#section-label').textContent =
            button.dataset.view === 'overview'
              ? 'Operations centre'
              : 'PotholeVision';
        }

      }
    );

  });


// =========================
// IMAGE FILE
// =========================

const imageFile = $('#image-file');

if (imageFile) {

  imageFile.addEventListener(
    'change',
    event => {

      if ($('#file-label')) {

        $('#file-label').textContent =
          event.target.files[0]?.name ||
          'Choose an image';

      }

    }
  );

}


// =========================
// AI DETECTION
// =========================

const detectButton =
  $('#detect-button');

if (detectButton) {

  detectButton.addEventListener(
    'click',
    async () => {

      const file =
        $('#image-file')?.files[0];

      if (!file) {
        toast('Choose an image first.');
        return;
      }

      const form =
        new FormData();

      form.append(
        'file',
        file
      );

      const result =
        $('#detection-result');

      if (result) {

        result.innerHTML = `
          <h3>Analysing image</h3>
          <p>
            Running the road image through
            the detection model.
          </p>
        `;

      }

      try {

        const data =
          await api(
            '/ai/detect',
            {
              method: 'POST',
              body: form
            }
          );

        if (result) {

          result.innerHTML = `
            <span class="empty-mark">
              ${data.detections_count}
            </span>

            <h3>
              ${data.detections_count}
              detection${data.detections_count === 1 ? '' : 's'}
            </h3>

            <p>
              ${
                data.detections &&
                data.detections.length
                  ? data.detections
                      .map(
                        d =>
                          `${d.class} (${Math.round(
                            d.confidence * 100
                          )}%)`
                      )
                      .join(', ')
                  : 'No potholes found in this image.'
              }
            </p>
          `;

        }

      } catch (error) {

        if (result) {

          result.innerHTML = `
            <h3>Detection failed</h3>
            <p>${error.message}</p>
          `;

        }

        console.error(
          'Detection error:',
          error
        );
      }

    }
  );

}


// =========================
// LOGIN / LOGOUT BUTTON
// =========================

const openAuth =
  $('#open-auth');

if (openAuth) {

  openAuth.addEventListener(
    'click',
    () => {

      if (state.user) {

        state.token = null;
        state.user = null;

        localStorage.removeItem(
          'pv_token'
        );

        localStorage.removeItem(
          'pv_user'
        );

        setUser();

        toast('Signed out');

      } else {

        const dialog =
          $('#auth-dialog');

        if (dialog) {
          dialog.showModal();
        }

      }

    }
  );

}


// =========================
// LOGIN
// =========================

const authForm =
  $('#auth-form');

if (authForm) {

  authForm.addEventListener(
    'submit',
    async event => {

      event.preventDefault();

      if ($('#auth-message')) {
        $('#auth-message').textContent = '';
      }

      try {

        const data =
          await api(
            '/auth/login',
            {
              method: 'POST',

              body: JSON.stringify({
                email:
                  $('#auth-email').value.trim(),

                password:
                  $('#auth-password').value
              })
            }
          );


        state.token =
          data.access_token;

        state.user =
          data.user;


        localStorage.setItem(
          'pv_token',
          state.token
        );

        localStorage.setItem(
          'pv_user',
          JSON.stringify(state.user)
        );


        $('#auth-dialog').close();

        setUser();

        toast('Signed in');

        refresh();

      } catch (error) {

        if ($('#auth-message')) {
          $('#auth-message').textContent =
            error.message;
        }

        console.error(
          'Login error:',
          error
        );

      }

    }
  );

}


// =========================
// REGISTER
// =========================

const registerButton =
  $('#register-button');

if (registerButton) {

  registerButton.addEventListener(
    'click',
    async () => {

      const email =
        $('#auth-email').value.trim();

      const password =
        $('#auth-password').value;


      if (!email || !password) {

        $('#auth-message').textContent =
          'Enter your email and password first.';

        return;
      }


      if (password.length < 6) {

        $('#auth-message').textContent =
          'Password must be at least 6 characters.';

        return;
      }


      $('#auth-message').textContent =
        'Creating account...';


      try {

        await api(
          '/auth/register',
          {
            method: 'POST',

            body: JSON.stringify({
              name:
                email.split('@')[0],

              email:
                email,

              password:
                password
            })
          }
        );


        $('#auth-message').textContent =
          'Account created successfully. You can now sign in.';


        $('#auth-password').value = '';

        toast(
          'Account created'
        );


      } catch (error) {

        $('#auth-message').textContent =
          error.message;

        console.error(
          'Registration error:',
          error
        );

      }

    }
  );

}


// =========================
// CREATE FORMS
// =========================

const forms = {

  pothole: {

    title:
      'Add pothole report',

    fields: `
      <label>
        Latitude

        <input
          name="latitude"
          type="number"
          step="any"
          required
        >
      </label>

      <label>
        Longitude

        <input
          name="longitude"
          type="number"
          step="any"
          required
        >
      </label>

      <label>
        Severity

        <select name="severity">
          <option>medium</option>
          <option>low</option>
          <option>high</option>
          <option>critical</option>
        </select>
      </label>
    `,

    endpoint:
      '/potholes'
  },


  contractor: {

    title:
      'Add contractor',

    fields: `
      <label>
        Name

        <input
          name="name"
          required
        >
      </label>

      <label>
        Company

        <input
          name="company"
          required
        >
      </label>

      <label>
        Email

        <input
          name="email"
          type="email"
        >
      </label>

      <label>
        Phone

        <input
          name="phone"
        >
      </label>
    `,

    endpoint:
      '/contractors'
  },


  order: {

    title:
      'Create work order',

    fields: `
      <label>
        Pothole ID

        <input
          name="pothole_id"
          type="number"
          required
        >
      </label>

      <label>
        Contractor ID

        <input
          name="contractor_id"
          type="number"
        >
      </label>

      <label>
        Priority

        <select name="priority">
          <option>medium</option>
          <option>low</option>
          <option>high</option>
          <option>critical</option>
        </select>
      </label>
    `,

    endpoint:
      '/work-orders'
  }

};


let activeForm = null;


// =========================
// OPEN FORM
// =========================

function openForm(type) {

  if (!state.token) {

    const authDialog =
      $('#auth-dialog');

    if (authDialog) {
      authDialog.showModal();
    }

    return;
  }


  activeForm =
    forms[type];


  $('#form-title').textContent =
    activeForm.title;

  $('#form-fields').innerHTML =
    activeForm.fields;

  $('#create-message').textContent =
    '';

  $('#create-dialog').showModal();
}


// =========================
// FORM BUTTONS
// =========================

if ($('#new-pothole')) {

  $('#new-pothole').addEventListener(
    'click',
    () => openForm('pothole')
  );

}


if ($('#new-contractor')) {

  $('#new-contractor').addEventListener(
    'click',
    () => openForm('contractor')
  );

}


if ($('#new-order')) {

  $('#new-order').addEventListener(
    'click',
    () => openForm('order')
  );

}


// =========================
// SAVE CREATE FORM
// =========================

const createForm =
  $('#create-form');

if (createForm) {

  createForm.addEventListener(
    'submit',
    async event => {

      event.preventDefault();


      if (!activeForm) {
        return;
      }


      const data =
        Object.fromEntries(
          new FormData(
            event.target
          ).entries()
        );


      Object.keys(data).forEach(
        key => {

          if (data[key] === '') {
            data[key] = null;
          }


          if (
            [
              'latitude',
              'longitude',
              'pothole_id',
              'contractor_id'
            ].includes(key) &&
            data[key] !== null
          ) {

            data[key] =
              Number(data[key]);

          }

        }
      );


      try {

        await api(
          activeForm.endpoint,
          {
            method: 'POST',

            body:
              JSON.stringify(data)
          }
        );


        $('#create-dialog').close();

        toast(
          'Saved successfully'
        );

        refresh();


      } catch (error) {

        $('#create-message').textContent =
          error.message;

        console.error(
          'Create error:',
          error
        );

      }

    }
  );

}


// =========================
// START APPLICATION
// =========================

setUser();

refresh();