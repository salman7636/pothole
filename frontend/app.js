/* =========================================
   POTHOLEVISION FRONTEND
========================================= */

const API_BASE = "https://potholevision-api.onrender.com";


/* =========================================
   HELPERS
========================================= */

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => document.querySelectorAll(selector);


function showToast(message) {

    const toast = $("#toast");

    if (!toast) return;

    toast.textContent = message;

    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}


async function apiFetch(path, options = {}) {

    const response = await fetch(
        `${API_BASE}${path}`,
        {
            ...options,
            headers: {
                ...(options.body instanceof FormData
                    ? {}
                    : { "Content-Type": "application/json" }),

                ...(options.headers || {})
            }
        }
    );


    let data = null;

    try {
        data = await response.json();
    } catch {
        data = null;
    }


    if (!response.ok) {

        const message =
            data?.detail ||
            data?.message ||
            `Request failed (${response.status})`;

        throw new Error(message);
    }


    return data;
}


/* =========================================
   NAVIGATION
========================================= */

const pageNames = {

    dashboard: "Dashboard",

    detection: "AI Detection",

    potholes: "Potholes",

    operations: "Operations"

};


function showPage(page) {

    $$(".page").forEach((element) => {
        element.classList.remove("active");
    });


    const target = $(`#page-${page}`);

    if (target) {
        target.classList.add("active");
    }


    $$(".nav-item").forEach((item) => {
        item.classList.remove("active");
    });


    const navItem =
        document.querySelector(
            `.nav-item[data-page="${page}"]`
        );


    if (navItem) {
        navItem.classList.add("active");
    }


    const heading = $("#page-heading");

    if (heading) {
        heading.textContent =
            pageNames[page] || "Dashboard";
    }


    const sidebar = $("#sidebar");

    if (sidebar) {
        sidebar.classList.remove("open");
    }


    loadPageData(page);
}


$$("[data-page]").forEach((button) => {

    button.addEventListener("click", () => {

        const page = button.dataset.page;

        if (page) {
            showPage(page);
        }

    });

});


/* =========================================
   MOBILE MENU
========================================= */

const menuBtn = $("#menu-btn");
const sidebar = $("#sidebar");


if (menuBtn) {

    menuBtn.addEventListener("click", () => {

        sidebar?.classList.toggle("open");

    });

}


/* =========================================
   API STATUS
========================================= */

async function checkAPI() {

    const connection =
        $("#connection-text");

    try {

        await apiFetch("/health");

        if (connection) {
            connection.textContent = "API Online";
        }

    } catch (error) {

        if (connection) {
            connection.textContent = "API Offline";
        }

        console.error("API error:", error);
    }

}


$("#api-status-btn")?.addEventListener(
    "click",
    async () => {

        await checkAPI();

        showToast("API status checked");

    }
);


$("#docs-btn")?.addEventListener(
    "click",
    () => {

        window.open(
            `${API_BASE}/docs`,
            "_blank"
        );

    }
);


/* =========================================
   DASHBOARD
========================================= */

async function loadOverview() {

    try {

        const data =
            await apiFetch("/potholes");


        const potholes =
            Array.isArray(data)
                ? data
                : data?.potholes || data?.items || [];


        updateMetric(
            "total-potholes",
            potholes.length
        );


        const open =
            potholes.filter(
                item =>
                    !["verified", "completed", "closed"]
                        .includes(
                            String(item.status || "").toLowerCase()
                        )
            ).length;


        updateMetric(
            "open-potholes",
            open
        );


        const verified =
            potholes.filter(
                item =>
                    ["verified", "completed", "closed"]
                        .includes(
                            String(item.status || "").toLowerCase()
                        )
            ).length;


        updateMetric(
            "verified-potholes",
            verified
        );


        renderSeverity(potholes);

        renderDashboardReports(potholes);

    } catch (error) {

        console.error(
            "Could not load overview:",
            error
        );

        showToast("Could not load dashboard data");

    }

}


function updateMetric(id, value) {

    const element = $(`#${id}`);

    if (element) {
        element.textContent = value;
    }

}


/* =========================================
   WORK ORDERS
========================================= */

async function loadOrders() {

    try {

        const data =
            await apiFetch("/work-orders");


        const orders =
            Array.isArray(data)
                ? data
                : data?.work_orders ||
                  data?.orders ||
                  data?.items ||
                  [];


        updateMetric(
            "total-orders",
            orders.length
        );


        renderOrders(orders);

    } catch (error) {

        console.error(
            "Could not load work orders:",
            error
        );

        updateMetric("total-orders", "--");

    }

}


/* =========================================
   POTHOLES
========================================= */

async function loadPotholes() {

    try {

        const data =
            await apiFetch("/potholes");


        const potholes =
            Array.isArray(data)
                ? data
                : data?.potholes ||
                  data?.items ||
                  [];


        renderPotholes(potholes);

        renderSeverity(potholes);

    } catch (error) {

        console.error(
            "Could not load potholes:",
            error
        );

        const empty =
            $("#pothole-empty");

        if (empty) {
            empty.style.display = "block";
        }

    }

}


function renderPotholes(items) {

    const tbody =
        $("#pothole-rows");

    const empty =
        $("#pothole-empty");


    if (!tbody) return;


    tbody.innerHTML = "";


    if (!items.length) {

        if (empty) {
            empty.style.display = "block";
        }

        return;
    }


    if (empty) {
        empty.style.display = "none";
    }


    items.forEach((item) => {

        const row =
            document.createElement("tr");


        row.innerHTML = `

            <td>
                #${item.id ?? "-"}
            </td>

            <td>
                ${escapeHTML(
                    item.location ||
                    item.address ||
                    "Unknown"
                )}
            </td>

            <td>
                ${severityBadge(
                    item.severity
                )}
            </td>

            <td>
                ${statusBadge(
                    item.status
                )}
            </td>

            <td>
                ${formatDate(
                    item.created_at ||
                    item.createdAt
                )}
            </td>

        `;


        tbody.appendChild(row);

    });

}


/* =========================================
   DASHBOARD REPORTS
========================================= */

function renderDashboardReports(items) {

    const tbody =
        $("#dashboard-pothole-rows");


    if (!tbody) return;


    tbody.innerHTML = "";


    items
        .slice(0, 5)
        .forEach((item) => {

            const row =
                document.createElement("tr");


            row.innerHTML = `

                <td>
                    #${item.id ?? "-"}
                </td>

                <td>
                    ${escapeHTML(
                        item.location ||
                        item.address ||
                        "Unknown"
                    )}
                </td>

                <td>
                    ${severityBadge(
                        item.severity
                    )}
                </td>

                <td>
                    ${statusBadge(
                        item.status
                    )}
                </td>

            `;


            tbody.appendChild(row);

        });

}


/* =========================================
   SEVERITY CHART
========================================= */

function renderSeverity(items) {

    const chart =
        $("#severity-chart");


    if (!chart) return;


    let low = 0;
    let medium = 0;
    let high = 0;


    items.forEach((item) => {

        const severity =
            String(
                item.severity || "low"
            ).toLowerCase();


        if (
            severity.includes("high") ||
            severity.includes("critical")
        ) {

            high++;

        } else if (
            severity.includes("medium") ||
            severity.includes("moderate")
        ) {

            medium++;

        } else {

            low++;

        }

    });


    const max =
        Math.max(low, medium, high, 1);


    chart.innerHTML = `

        <div class="severity-bar">

            <div class="bar-number">
                ${low}
            </div>

            <div
                class="bar"
                style="height:${Math.max(
                    5,
                    (low / max) * 130
                )}px">
            </div>

            <div class="bar-label">
                Low
            </div>

        </div>


        <div class="severity-bar">

            <div class="bar-number">
                ${medium}
            </div>

            <div
                class="bar medium"
                style="height:${Math.max(
                    5,
                    (medium / max) * 130
                )}px">
            </div>

            <div class="bar-label">
                Medium
            </div>

        </div>


        <div class="severity-bar">

            <div class="bar-number">
                ${high}
            </div>

            <div
                class="bar high"
                style="height:${Math.max(
                    5,
                    (high / max) * 130
                )}px">
            </div>

            <div class="bar-label">
                High
            </div>

        </div>

    `;

}


/* =========================================
   OPERATIONS
========================================= */

async function loadOperations() {

    try {

        const data =
            await apiFetch("/contractors");


        const contractors =
            Array.isArray(data)
                ? data
                : data?.contractors ||
                  data?.items ||
                  [];


        renderContractors(
            contractors
        );

    } catch (error) {

        console.error(
            "Contractor loading error:",
            error
        );

    }


    await loadOrders();

}


function renderContractors(items) {

    const tbody =
        $("#contractor-rows");

    const empty =
        $("#contractor-empty");


    if (!tbody) return;


    tbody.innerHTML = "";


    if (!items.length) {

        if (empty) {
            empty.style.display = "block";
        }

        return;
    }


    if (empty) {
        empty.style.display = "none";
    }


    items.forEach((item) => {

        const row =
            document.createElement("tr");


        row.innerHTML = `

            <td>
                #${item.id ?? "-"}
            </td>

            <td>
                ${escapeHTML(
                    item.name ||
                    "Unnamed"
                )}
            </td>

            <td>
                ${statusBadge(
                    item.status || "active"
                )}
            </td>

        `;


        tbody.appendChild(row);

    });

}


function renderOrders(items) {

    const tbody =
        $("#order-rows");

    const empty =
        $("#order-empty");


    if (!tbody) return;


    tbody.innerHTML = "";


    if (!items.length) {

        if (empty) {
            empty.style.display = "block";
        }

        return;
    }


    if (empty) {
        empty.style.display = "none";
    }


    items.forEach((item) => {

        const row =
            document.createElement("tr");


        row.innerHTML = `

            <td>
                #${item.id ?? "-"}
            </td>

            <td>
                #${item.pothole_id ?? "-"}
            </td>

            <td>
                ${statusBadge(
                    item.status
                )}
            </td>

        `;


        tbody.appendChild(row);

    });

}


/* =========================================
   AI DETECTION
========================================= */

const imageFile =
    $("#image-file");

const uploadArea =
    $("#upload-area");

const detectButton =
    $("#detect-button");


imageFile?.addEventListener(
    "change",
    () => {

        const file =
            imageFile.files?.[0];


        if (!file) return;


        const label =
            $("#file-label");


        if (label) {
            label.textContent =
                file.name;
        }

    }
);


uploadArea?.addEventListener(
    "dragover",
    (event) => {

        event.preventDefault();

        uploadArea.classList.add(
            "dragging"
        );

    }
);


uploadArea?.addEventListener(
    "dragleave",
    () => {

        uploadArea.classList.remove(
            "dragging"
        );

    }
);


uploadArea?.addEventListener(
    "drop",
    (event) => {

        event.preventDefault();

        uploadArea.classList.remove(
            "dragging"
        );


        const file =
            event.dataTransfer.files?.[0];


        if (!file) return;


        if (
            !file.type.startsWith(
                "image/"
            )
        ) {

            showToast(
                "Please choose an image"
            );

            return;
        }


        const transfer =
            new DataTransfer();

        transfer.items.add(file);

        imageFile.files =
            transfer.files;


        const label =
            $("#file-label");


        if (label) {
            label.textContent =
                file.name;
        }

    }
);


detectButton?.addEventListener(
    "click",
    detectPothole
);


async function detectPothole() {

    const file =
        imageFile?.files?.[0];


    if (!file) {

        showToast(
            "Please select an image first"
        );

        return;
    }


    const result =
        $("#detection-result");


    if (result) {

        result.innerHTML = `

            <div class="result-placeholder">

                <div>
                    ◌
                </div>

                <p>
                    AI is analyzing the image...
                </p>

            </div>

        `;

    }


    detectButton.disabled = true;

    detectButton.textContent =
        "Analyzing...";


    try {

        const formData =
            new FormData();

        formData.append(
            "file",
            file
        );


        const response =
            await apiFetch(
                "/ai/detect",
                {
                    method: "POST",
                    body: formData
                }
            );


        renderDetectionResult(
            response
        );


        showToast(
            "Detection completed"
        );

    } catch (error) {

        console.error(
            "Detection error:",
            error
        );


        if (result) {

            result.innerHTML = `

                <div class="result-placeholder">

                    <div>
                        !
                    </div>

                    <p>
                        ${escapeHTML(
                            error.message
                        )}
                    </p>

                </div>

            `;

        }


        showToast(
            "Detection failed"
        );

    } finally {

        detectButton.disabled = false;

        detectButton.innerHTML =
            "<span>◈</span> Detect Potholes";

    }

}


function renderDetectionResult(data) {

    const result =
        $("#detection-result");


    if (!result) return;


    const detections =
        data?.detections ||
        data?.results ||
        [];


    result.innerHTML = `

        <div class="result-success">

            <div class="result-number">
                ${data?.detections_count ??
                  detections.length}
            </div>

            <div class="result-caption">
                pothole(s) detected
            </div>

            ${
                detections.length
                    ? detections.map(
                        (item, index) => `

                        <div class="detection-item">

                            <strong>
                                Pothole ${index + 1}
                            </strong>

                            <span>
                                Confidence:
                                ${(
                                    Number(
                                        item.confidence || 0
                                    ) * 100
                                ).toFixed(1)}%
                            </span>

                        </div>

                    `
                    ).join("")
                    : `
                        <div class="detection-item">
                            <strong>
                                No potholes detected
                            </strong>
                        </div>
                    `
            }

        </div>

    `;

}


/* =========================================
   AUTH
========================================= */

const authDialog =
    $("#auth-dialog");


$("#open-auth")?.addEventListener(
    "click",
    () => {

        authDialog?.showModal();

    }
);


$("#mobile-user")?.addEventListener(
    "click",
    () => {

        authDialog?.showModal();

    }
);


$("#close-auth")?.addEventListener(
    "click",
    () => {

        authDialog?.close();

    }
);


$("#auth-form")?.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        await login();

    }
);


async function login() {

    const email =
        $("#auth-email")?.value.trim();

    const password =
        $("#auth-password")?.value;


    const message =
        $("#auth-message");


    if (!email || !password) {

        setMessage(
            message,
            "Please enter email and password.",
            "error"
        );

        return;
    }


    setMessage(
        message,
        "Signing in...",
        ""
    );


    try {

        const response =
            await apiFetch(
                "/auth/login",
                {
                    method: "POST",

                    body: JSON.stringify({
                        email,
                        password
                    })
                }
            );


        if (response?.access_token) {

            localStorage.setItem(
                "potholevision_token",
                response.access_token
            );

        }


        const name =
            response?.user?.name ||
            response?.user?.email ||
            email.split("@")[0];


        setUser(name);


        authDialog?.close();


        showToast(
            "Signed in successfully"
        );


    } catch (error) {

        setMessage(
            message,
            error.message,
            "error"
        );

    }

}


/* =========================================
   REGISTER
========================================= */

$("#register-button")?.addEventListener(
    "click",
    async () => {

        await register();

    }
);


async function register() {

    const email =
        $("#auth-email")?.value.trim();

    const password =
        $("#auth-password")?.value;


    const message =
        $("#auth-message");


    if (!email || !password) {

        setMessage(
            message,
            "Enter email and password first.",
            "error"
        );

        return;
    }


    if (password.length < 6) {

        setMessage(
            message,
            "Password must be at least 6 characters.",
            "error"
        );

        return;
    }


    setMessage(
        message,
        "Creating account...",
        ""
    );


    try {

        const response =
            await apiFetch(
                "/auth/register",
                {
                    method: "POST",

                    body: JSON.stringify({
                        email,
                        password
                    })
                }
            );


        setMessage(
            message,
            "Account created! You can now sign in.",
            "success"
        );


        showToast(
            "Account created successfully"
        );


    } catch (error) {

        setMessage(
            message,
            error.message,
            "error"
        );

    }

}


/* =========================================
   USER
========================================= */

function setUser(name) {

    const element =
        $("#user-name");


    if (element) {
        element.textContent = name;
    }


    const avatar =
        $(".user-avatar");


    if (avatar) {

        avatar.textContent =
            String(name)
                .charAt(0)
                .toUpperCase();

    }

}


/* =========================================
   CREATE RECORD
========================================= */

const createDialog =
    $("#create-dialog");


let createType = null;


$("#close-create")?.addEventListener(
    "click",
    () => {

        createDialog?.close();

    }
);


$("#cancel-create")?.addEventListener(
    "click",
    () => {

        createDialog?.close();

    }
);


$("#new-pothole")?.addEventListener(
    "click",
    () => {

        openCreate(
            "pothole"
        );

    }
);


$("#new-contractor")?.addEventListener(
    "click",
    () => {

        openCreate(
            "contractor"
        );

    }
);


$("#new-order")?.addEventListener(
    "click",
    () => {

        openCreate(
            "order"
        );

    }
);


function openCreate(type) {

    createType = type;


    const title =
        $("#form-title");

    const fields =
        $("#form-fields");


    if (!fields) return;


    if (type === "pothole") {

        title.textContent =
            "Add Pothole Report";


        fields.innerHTML = `

            <label>
                Location
            </label>

            <input
                name="location"
                placeholder="Road / location"
                required>


            <label>
                Severity
            </label>

            <select name="severity">

                <option value="low">
                    Low
                </option>

                <option value="medium">
                    Medium
                </option>

                <option value="high">
                    High
                </option>

            </select>

        `;

    }


    if (type === "contractor") {

        title.textContent =
            "Add Contractor";


        fields.innerHTML = `

            <label>
                Contractor Name
            </label>

            <input
                name="name"
                placeholder="Company name"
                required>

        `;

    }


    if (type === "order") {

        title.textContent =
            "Create Work Order";


        fields.innerHTML = `

            <label>
                Pothole ID
            </label>

            <input
                name="pothole_id"
                type="number"
                placeholder="Pothole ID"
                required>


            <label>
                Status
            </label>

            <select name="status">

                <option value="open">
                    Open
                </option>

                <option value="assigned">
                    Assigned
                </option>

            </select>

        `;

    }


    createDialog?.showModal();

}


$("#create-form")?.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const form =
            event.currentTarget;

        const formData =
            new FormData(form);

        const payload =
            Object.fromEntries(
                formData.entries()
            );


        try {

            let endpoint = "";


            if (createType === "pothole") {

                endpoint =
                    "/potholes";

            } else if (
                createType === "contractor"
            ) {

                endpoint =
                    "/contractors";

            } else if (
                createType === "order"
            ) {

                endpoint =
                    "/work-orders";

            }


            await apiFetch(
                endpoint,
                {
                    method: "POST",

                    body: JSON.stringify(
                        payload
                    )
                }
            );


            createDialog?.close();


            showToast(
                "Record created successfully"
            );


            refresh();

        } catch (error) {

            setMessage(
                $("#create-message"),
                error.message,
                "error"
            );

        }

    }
);


/* =========================================
   LOAD PAGE DATA
========================================= */

function loadPageData(page) {

    if (page === "dashboard") {

        loadOverview();
        loadOrders();

    }


    if (page === "potholes") {

        loadPotholes();

    }


    if (page === "operations") {

        loadOperations();

    }

}


/* =========================================
   REFRESH
========================================= */

function refresh() {

    loadOverview();

    loadOrders();

}


/* =========================================
   UTILITIES
========================================= */

function setMessage(
    element,
    text,
    type
) {

    if (!element) return;

    element.textContent = text;

    element.className =
        `form-message ${type}`;

}


function severityBadge(severity) {

    const value =
        String(
            severity || "low"
        ).toLowerCase();


    let className = "open";


    if (
        value.includes("high") ||
        value.includes("critical")
    ) {

        className = "critical";

    } else if (
        value.includes("medium")
    ) {

        className = "open";

    }


    return `
        <span class="status ${className}">
            ${escapeHTML(
                severity || "Low"
            )}
        </span>
    `;

}


function statusBadge(status) {

    const value =
        String(
            status || "open"
        );


    const lower =
        value.toLowerCase();


    let className = "open";


    if (
        lower.includes("verified") ||
        lower.includes("completed") ||
        lower.includes("closed")
    ) {

        className = "verified";

    } else if (
        lower.includes("critical")
    ) {

        className = "critical";

    } else if (
        lower.includes("assigned")
    ) {

        className = "assigned";

    }


    return `
        <span class="status ${className}">
            ${escapeHTML(value)}
        </span>
    `;

}


function formatDate(value) {

    if (!value) {
        return "-";
    }


    try {

        return new Date(value)
            .toLocaleDateString();

    } catch {

        return String(value);

    }

}


function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =========================================
   START APPLICATION
========================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        checkAPI();

        refresh();

    }
);