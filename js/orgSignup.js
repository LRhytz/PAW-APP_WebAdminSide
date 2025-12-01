(function () {
  // ---------- Firebase handles ----------
  const auth = firebase.auth();
  const db = firebase.database();
  const hasStorage = !!(firebase.storage);
  const storage = hasStorage ? firebase.storage() : null;

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const emailValid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || "");
  const extOf = (name) => ((name || "").match(/\.(\w{1,10})$/) || [,"bin"])[1].toLowerCase();
  const setDisabled = (el, v) => { if (el) el.disabled = !!v; };

  // ---------- DOM refs (IDs from your HTML) ----------
  const form       = $("org-form");
  const btnSubmit  = $("btnSubmit");

  const btnPickLogo = $("btnPickLogo");
  const logoFile    = $("logoFile");
  const logoPreview = $("logoPreview");

  const btnPickDoc  = $("btnPickDoc");
  const docFile     = $("docFile");
  const docName     = $("docName");
  const docThumb    = $("docThumb");

  const orgName  = $("orgName");
  const repName  = $("repName");
  const orgType  = $("orgType");
  const licenseNo= $("licenseNo");
  const email    = $("email");
  const phone    = $("phone");
  const address  = $("address");
  const password = $("password");
  const confirm  = $("confirm");
  const cbTerms  = $("cb-terms");

  const alertBox = $("alert");

  // ---------- Fix login link to index.html ----------
  (function fixLoginHref() {
    const a = document.querySelector('.fineprint a, .signup-login-inline a, a[href*="login.html"]');
    if (a) a.setAttribute("href", "index.html");
  })();

  // ---------- Terms modal (injected) ----------
  (function injectTermsModal() {
    const link = document.querySelector(".terms-link");
    if (!link) return;

    // Build modal once
    const overlay = document.createElement("div");
    overlay.id = "terms-overlay";
    Object.assign(overlay.style, {
      position:"fixed", inset:"0", background:"rgba(0,0,0,.45)",
      display:"none", alignItems:"center", justifyContent:"center", zIndex:"9999"
    });

    const modal = document.createElement("div");
    Object.assign(modal.style, {
      width:"min(900px, 92vw)", maxHeight:"80vh", overflow:"auto",
      background:"#fff", borderRadius:"14px", boxShadow:"0 20px 50px rgba(0,0,0,.25)",
      padding:"18px 18px 14px"
    });

    modal.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px">
        <h3 style="margin:0;font-size:1.15rem;font-weight:800">Terms & Conditions</h3>
        <button id="terms-close" style="border:none;background:#f4f6f8;border-radius:10px;padding:8px 12px;cursor:pointer">Close</button>
      </div>
      <div style="color:#333;line-height:1.55;font-size:.95rem">
        <p><strong>1. Eligibility.</strong> Organizations must provide accurate information and valid registration/license details.</p>
        <p><strong>2. Data Use.</strong> We store contact details and documents you upload to verify your organization and provide platform features.</p>
        <p><strong>3. Content Responsibility.</strong> You are responsible for content you submit (listings, images, documents).</p>
        <p><strong>4. Verification.</strong> Your account may remain unverified until documents are reviewed. Some features may be limited.</p>
        <p><strong>5. Security.</strong> Keep credentials private. Notify us of any unauthorized access.</p>
        <p><strong>6. Updates.</strong> Terms may change. Continued use implies acceptance of updates.</p>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const open = (e) => { e.preventDefault(); overlay.style.display = "flex"; };
    const close = () => { overlay.style.display = "none"; };

    link.addEventListener("click", open);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    modal.querySelector("#terms-close").addEventListener("click", close);
  })();

  // ---------- Upload button wiring ----------
  if (btnPickLogo && logoFile) {
    // Ensure it's not type="submit"
    if (!btnPickLogo.type || btnPickLogo.type.toLowerCase() === "submit") btnPickLogo.type = "button";
    btnPickLogo.addEventListener("click", (e) => { e.preventDefault(); logoFile.click(); });
  }
  if (btnPickDoc && docFile) {
    if (!btnPickDoc.type || btnPickDoc.type.toLowerCase() === "submit") btnPickDoc.type = "button";
    btnPickDoc.addEventListener("click", (e) => { e.preventDefault(); docFile.click(); });
  }

  // ---------- Previews ----------
  if (logoFile && logoPreview) {
    logoFile.addEventListener("change", () => {
      const f = logoFile.files && logoFile.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => (logoPreview.src = reader.result);
      reader.readAsDataURL(f);
    });
  }

  if (docFile) {
    docFile.addEventListener("change", () => {
      const f = docFile.files && docFile.files[0];
      if (!f) return;
      if (docName) docName.textContent = f.name;
      if (docThumb && f.type && f.type.startsWith("image/")) {
        // show small image thumbnail
        const reader = new FileReader();
        reader.onload = () => {
          docThumb.innerHTML = `<img src="${reader.result}" alt="doc" style="width:100%;height:100%;object-fit:cover;border-radius:10px"/>`;
        };
        reader.readAsDataURL(f);
      } else if (docThumb) {
        // show file icon
        docThumb.innerHTML = `<i class="far fa-file-alt"></i>`;
      }
    });
  }

  // ---------- Inline validation ----------
  if (email) {
    email.addEventListener("input", () => {
      email.setCustomValidity(emailValid(email.value) ? "" : "Invalid email");
    });
  }
  if (password) {
    password.addEventListener("input", () => {
      password.setCustomValidity((password.value || "").length >= 6 ? "" : "Minimum 6 characters");
    });
  }
  if (confirm && password) {
    const sync = () => {
      confirm.setCustomValidity(confirm.value === password.value ? "" : "Passwords do not match");
    };
    confirm.addEventListener("input", sync);
    password.addEventListener("input", sync);
  }

  // ---------- Alerts ----------
  function showAlert(msg) {
    if (!alertBox) { alert(msg); return; }
    alertBox.textContent = msg;
    alertBox.hidden = false;
  }
  function hideAlert() {
    if (alertBox) alertBox.hidden = true;
  }
  function toast(msg, ok = true) {
    const t = document.createElement("div");
    t.textContent = msg;
    Object.assign(t.style, {
      position:"fixed", left:"50%", bottom:"22px", transform:"translateX(-50%)",
      background: ok ? "#2e7d32" : "#c62828", color:"#fff",
      padding:"10px 14px", borderRadius:"10px", boxShadow:"0 8px 24px rgba(0,0,0,.25)", zIndex:9999
    });
    document.body.appendChild(t); setTimeout(()=>t.remove(), 2200);
  }

  function setLoading(loading) {
    if (!btnSubmit) return;
    btnSubmit.classList.toggle("loading", !!loading);
    setDisabled(btnSubmit, !!loading);
  }

  // ---------- Submit flow ----------
  if (!form) {
    console.warn("orgSignup: form #org-form not found.");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();

    const vOrgName  = (orgName?.value || "").trim();
    const vRepName  = (repName?.value || "").trim();
    const vType     = (orgType?.value || "").trim();
    const vLicense  = (licenseNo?.value || "").trim();
    const vEmail    = (email?.value || "").trim();
    const vPhone    = (phone?.value || "").trim();
    const vAddress  = (address?.value || "").trim();
    const vPassword = password?.value || "";
    const vConfirm  = confirm?.value  || "";

    if (!vOrgName)  return showAlert("Please enter your Organization Name.");
    if (!vRepName)  return showAlert("Please enter the Representative Name.");
    if (!vType)     return showAlert("Please choose an Organization Type.");
    if (!vLicense)  return showAlert("Please enter the License / Registration number.");
    if (!vEmail || !emailValid(vEmail)) return showAlert("Please enter a valid email.");
    if (!vPhone)    return showAlert("Please enter a contact number.");
    if (!vAddress)  return showAlert("Please enter the official address.");
    if (!vPassword || vPassword.length < 6) return showAlert("Password must be at least 6 characters.");
    if (vPassword !== vConfirm) return showAlert("Passwords do not match.");
    if (cbTerms && !cbTerms.checked) return showAlert("Please agree to the Terms and Conditions.");

    if (!hasStorage) {
      return showAlert('Uploads require Firebase Storage SDK:\n<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-storage.js"></script>');
    }

    setLoading(true);

    try {
      // 1) create auth user
      const cred = await auth.createUserWithEmailAndPassword(vEmail, vPassword);
      const uid = cred.user.uid;

      // 2) optional uploads
      const logoF = logoFile && logoFile.files && logoFile.files[0];
      const docF  = docFile  && docFile.files  && docFile.files[0];

      const uploadIfAny = async (file, path) => {
        if (!file) return "";
        const ref = storage.ref().child(path);
        await ref.put(file);
        return await ref.getDownloadURL();
      };

      const logoUrl = await uploadIfAny(logoF, `orgs/${uid}/logo.${logoF ? extOf(logoF.name) : "png"}`);
      const docUrl  = await uploadIfAny(docF,  `orgs/${uid}/document_${Date.now()}.${docF ? extOf(docF.name) : "pdf"}`);

      // 3) DB writes (align with your rules)
      const now = Date.now();

      const updates = {};
      updates[`users/${uid}`] = {
        email: vEmail,
        role: "organization",
        createdAt: now,
        updatedAt: now
      };
      updates[`organizations/${uid}`] = {
        id: uid,
        name: vOrgName,
        representativeName: vRepName,
        type: vType,
        license: vLicense,
        email: vEmail,
        phone: vPhone,
        address: vAddress,
        verified: false,
        logoUrl: logoUrl || "",
        documentUrl: docUrl || "",
        createdAt: now,
        updatedAt: now
      };
      updates[`orgSubscriptions/${uid}`] = {
        verified: false,
        status: "inactive",
        updatedAt: now
      };

      await db.ref().update(updates);

      // best-effort email verify
      try { await cred.user.sendEmailVerification(); } catch {}

      toast("Organization registered!");
      window.location.href = "organizationDashboard.html";
    } catch (err) {
      console.error("orgSignup error:", err);
      showAlert(err?.message || "Registration failed. Please try again.");
      setLoading(false);
      return;
    }
  });

  // If someone clicks the button but it isn't type="submit", submit the form anyway
  if (btnSubmit && btnSubmit.type !== "submit") {
    btnSubmit.addEventListener("click", (e) => {
      e.preventDefault();
      form.dispatchEvent(new Event("submit", { bubbles:true, cancelable:true }));
    });
  }
})();
