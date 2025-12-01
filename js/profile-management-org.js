// File: js/profile-management-org.js
(function () {
  const auth = firebase.auth();
  const db   = firebase.database();
  const st   = firebase.storage();

  // Sidebar toggle
  window.openNav  = () => document.body.classList.add("nav-open");
  window.closeNav = () => document.body.classList.remove("nav-open");

  // DOM refs (hero/header)
  const avatar   = document.getElementById("avatar");
  const btnCam   = document.getElementById("btnChangeAvatar");
  const pickImg  = document.getElementById("profileImage");
  const orgNameH = document.getElementById("orgNames");
  const emailH   = document.getElementById("email");
  const planSm   = document.getElementById("tvOrgPlan");

  // Metrics
  const tvPets   = document.getElementById("tvTotalPets");
  const tvArts   = document.getElementById("tvTotalArticles");
  const tvDon    = document.getElementById("tvDonationCampaigns");

  // Subscription (card)
  const tvSub    = document.getElementById("tvSubscriptionStatus");
  const tvSubSub = document.getElementById("tvSubscriptionSubtitle");

  // Edit modal (popup)
  const editModal = document.getElementById("editModal");
  const infoModal = document.getElementById("infoModal");
  const infoTitle = document.getElementById("infoTitle");
  const infoBody  = document.getElementById("infoBody");

  const btnEditRow   = document.getElementById("btnEditProfileRow");
  const btnAbout     = document.getElementById("btnAbout");
  const btnPrivacy   = document.getElementById("btnPrivacy");
  const editForm     = document.getElementById("editForm");
  const editMsg      = document.getElementById("editMsg");
  const editAvatar   = document.getElementById("editAvatar");
  const btnPickNew   = document.getElementById("btnPickNewLogo");
  const newLogoFile  = document.getElementById("newLogoFile");

  // Edit fields
  const ef = (id) => document.getElementById(id);
  const ef_orgName = ef("ef_orgName");
  const ef_repName = ef("ef_repName");
  const ef_email   = ef("ef_email");
  const ef_phone   = ef("ef_phone");
  const ef_address = ef("ef_address");
  const ef_license = ef("ef_license");
  const ef_type    = ef("ef_type");

  const PLACEHOLDER   = "https://placehold.co/200x200";
  const TYPE_OPTIONS  = ["Shelter","Rescue Group","Advocacy Group","Veterinary Clinic","Other"];
  let currentUid      = null;
  let currentLogoUrl  = "";

  // Utilities
  const open  = (node) => node && node.setAttribute("aria-hidden","false");
  const close = (node) => node && node.setAttribute("aria-hidden","true");
  const setText = (el, v) => { if (el) el.textContent = (v ?? ""); };

  function ensureTypeOptions(selectEl) {
    if (!selectEl || selectEl.tagName !== "SELECT") return;
    const have = new Set(Array.from(selectEl.options).map(o => o.value));
    TYPE_OPTIONS.forEach(v => {
      if (!have.has(v)) {
        const opt = document.createElement("option");
        opt.value = v; opt.textContent = v;
        selectEl.appendChild(opt);
      }
    });
  }
  ensureTypeOptions(ef_type);

  // Camera button -> file picker, then upload
  if (btnCam && pickImg) {
    btnCam.addEventListener("click", (e) => { e.preventDefault(); pickImg.click(); });
  }
  if (pickImg && avatar) {
    pickImg.addEventListener("change", async () => {
      const file = pickImg.files && pickImg.files[0];
      if (!file || !currentUid) return;
      avatar.src = URL.createObjectURL(file); // instant preview
      try {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const ref = st.ref(`profile_images/organizations/${currentUid}/avatar_${Date.now()}.${ext}`);
        const put = await ref.put(file);
        const url = await put.ref.getDownloadURL();
        currentLogoUrl = url;

        const now = Date.now();
        await Promise.all([
          db.ref(`organizations/${currentUid}`).update({ logoUrl: url, updatedAt: now }),
          db.ref(`users/${currentUid}`).update({ logoImageUri: url, updatedAt: now })
        ]);

        avatar.src = `${url}#${Date.now()}`; // bust cache
      } catch (e) {
        console.warn("Avatar upload failed:", e);
      }
    });
  }

  // Merge helper: prefer non-empty a over b
  const pref = (a, b) => {
    const s = (x) => (x === undefined || x === null) ? "" : String(x);
    return s(a).trim() ? s(a).trim() : s(b).trim();
  };

  // Load profile + subscription + metrics
  auth.onAuthStateChanged(async (u) => {
    if (!u) { window.location = "index.html"; return; }
    currentUid = u.uid;
    setText(emailH, u.email || "");

    try {
      // Load both sources (Android repo returns a merged map; we replicate that here)
      const [userSnap, orgSnap] = await Promise.all([
        db.ref(`users/${u.uid}`).once("value"),
        db.ref(`organizations/${u.uid}`).once("value")
      ]);

      const user = userSnap.val() || {};
      const org  = orgSnap.val()  || {};

      // Merge to the same keys Android activity expects
      const merged = {
        organizationName : pref(user.organizationName, org.organizationName || org.name),
        representativeName: pref(user.representativeName, org.representativeName),
        email            : pref(org.email, user.email || u.email),
        phone            : pref(user.phone, org.phone),
        address          : pref(user.address, org.address),
        licenseNumber    : pref(user.licenseNumber, org.licenseNumber || org.license),
        organizationType : pref(user.organizationType, org.organizationType || org.type),
        logoImageUri     : pref(user.logoImageUri, org.logoImageUri || org.logoUrl)
      };

      // Hero fill
      setText(orgNameH, merged.organizationName || "(not set)");
      avatar.src      = merged.logoImageUri || PLACEHOLDER;
      if (editAvatar) editAvatar.src = merged.logoImageUri || "https://placehold.co/84";
      currentLogoUrl  = merged.logoImageUri || "";

      // Editor fill
      if (ef_orgName) ef_orgName.value = merged.organizationName || "";
      if (ef_repName) ef_repName.value = merged.representativeName || "";
      if (ef_email)   ef_email.value   = merged.email || (u.email || "");
      if (ef_phone)   ef_phone.value   = merged.phone || "";
      if (ef_address) ef_address.value = merged.address || "";
      if (ef_license) ef_license.value = merged.licenseNumber || "";

      if (ef_type) {
        ensureTypeOptions(ef_type);
        const tVal = (merged.organizationType || "").trim();
        if (tVal && !TYPE_OPTIONS.includes(tVal)) {
          // Inject unknown value so it's selectable
          const opt = document.createElement("option");
          opt.value = tVal; opt.textContent = tVal;
          ef_type.appendChild(opt);
        }
        ef_type.value = tVal || "";
      }
    } catch (e) {
      console.error("Profile load error:", e);
    }

    attachSubscription(u.uid);
    attachMetrics(u.uid);
  });

  // Subscription text
  function attachSubscription(uid) {
    db.ref(`orgSubscriptions/${uid}`).on("value", (snap) => {
      const d = snap.val() || {};
      const plan = d.plan || "free";
      const status = d.status || "inactive";
      const verified = !!d.verified;
      const endMs = Number(d.currentPeriodEndMs || 0);

      const title =
        plan === "monthly" ? "Monthly Plan" :
        plan === "yearly"  ? "Yearly Plan"  : "Free Plan";

      setText(planSm, title);
      setText(tvSub,  title);

      if (verified && (status === "active" || status === "trialing") && endMs > 0) {
        const dt = new Date(endMs).toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" });
        setText(tvSubSub, `Next renewal on ${dt}`);
      } else {
        setText(tvSubSub, "Upgrade to unlock more features");
      }
    }, (e)=>console.warn("sub error:", e));
  }

  // Simple metrics listeners
  function attachMetrics(uid) {
    db.ref("adoptions").orderByChild("orgId").equalTo(uid)
      .on("value", (s)=> setText(tvPets, String(Object.keys(s.val()||{}).length)), (e)=>console.warn(e));
    db.ref("articles").orderByChild("orgId").equalTo(uid)
      .on("value", (s)=> setText(tvArts, String(Object.keys(s.val()||{}).length)), (e)=>console.warn(e));
    db.ref("donationCampaigns").orderByChild("orgId").equalTo(uid)
      .on("value", (s)=> setText(tvDon,  String(Object.keys(s.val()||{}).length)), (e)=>console.warn(e));
  }

  // —— Edit Profile modal open/close
  function fillEditFromHero() {
    if (editAvatar && avatar) editAvatar.src = avatar.src || "https://placehold.co/84";
  }
  if (btnEditRow && editModal) {
    btnEditRow.addEventListener("click", () => { fillEditFromHero(); open(editModal); });
  }
  document.querySelectorAll("[data-close-edit]").forEach(b => b.addEventListener("click", ()=> close(editModal)));

  if (btnPickNew && newLogoFile) btnPickNew.addEventListener("click", ()=> newLogoFile.click());
  if (newLogoFile && editAvatar) {
    newLogoFile.addEventListener("change", () => {
      const f = newLogoFile.files && newLogoFile.files[0];
      if (f) editAvatar.src = URL.createObjectURL(f);
    });
  }

  // Save profile
  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUid) return;

      const val = (el) => (el && typeof el.value === "string") ? el.value.trim() : "";

      const name = val(ef_orgName);
      if (!name) { if (editMsg) editMsg.textContent = "Organization name is required."; return; }

      if (editMsg) editMsg.textContent = "Saving…";
      try {
        // upload new logo if selected
        let logoUrl = currentLogoUrl;
        const f = newLogoFile && newLogoFile.files && newLogoFile.files[0];
        if (f) {
          const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
          const ref = st.ref(`profile_images/organizations/${currentUid}/avatar_${Date.now()}.${ext}`);
          const put = await ref.put(f);
          logoUrl = await put.ref.getDownloadURL();
        }

        const now = Date.now();

        // write organizations/{uid}
        const orgUpdate = {
          name,
          representativeName: val(ef_repName) || null,
          email:   val(ef_email)   || null,
          phone:   val(ef_phone)   || null,
          address: val(ef_address) || null,
          // store both keys for compatibility with Android/web
          license: val(ef_license) || null,
          licenseNumber: val(ef_license) || null,
          type:    val(ef_type)    || null,
          organizationType: val(ef_type) || null,
          updatedAt: now
        };
        if (logoUrl) orgUpdate.logoUrl = logoUrl, orgUpdate.logoImageUri = logoUrl;

        // mirror to users/{uid}
        const userUpdate = {
          organizationName: name,
          // mirror optional extras if your Android repo ever reads from /users
          representativeName: val(ef_repName) || undefined,
          phone:   val(ef_phone)   || undefined,
          address: val(ef_address) || undefined,
          licenseNumber: val(ef_license) || undefined,
          organizationType: val(ef_type) || undefined,
          updatedAt: now
        };
        if (logoUrl) userUpdate.logoImageUri = logoUrl;

        await Promise.all([
          db.ref(`organizations/${currentUid}`).update(orgUpdate),
          db.ref(`users/${currentUid}`).update(userUpdate)
        ]);

        // UI refresh
        if (logoUrl) {
          const bust = `${logoUrl}#${Date.now()}`;
          if (avatar) avatar.src = bust;
          if (editAvatar) editAvatar.src = bust;
          currentLogoUrl = logoUrl;
        }
        if (orgNameH) orgNameH.textContent = name;

        if (editMsg) editMsg.textContent = "Saved!";
        setTimeout(() => { if (editMsg) editMsg.textContent = ""; close(editModal); }, 600);
      } catch (err) {
        console.error("Edit save error:", err);
        if (editMsg) editMsg.textContent = err?.message || "Failed to save profile.";
      }
    });
  }

  // —— About & Privacy popups (no navigation)
  const ABOUT_HTML = `
  <p><b>PAW APP</b> helps organizations manage animal welfare initiatives in Cebu City.</p>
  <ul>
    <li>Publish adoption listings &amp; articles</li>
    <li>Track donation campaigns</li>
    <li>Coordinate with citizens and partners</li>
  </ul>
  <p>Questions? Email <a href="mailto:support@pawapp.ph">support@pawapp.ph</a>.</p>`;

  const PRIVACY_HTML = `
  <p><b>Overview</b></p>
  <p>This policy follows the Philippine Data Privacy Act (RA 10173). We collect account info and operational data to run PAW APP. We do not sell your data.</p>
  <ul>
    <li>Access/correct/delete/export: <a href="mailto:privacy@pawapp.ph">privacy@pawapp.ph</a></li>
    <li>We may share limited data with Cebu City partners to act on reports.</li>
  </ul>
  <p>For the full policy, contact our DPO at <a href="mailto:dpo@pawapp.ph">dpo@pawapp.ph</a>.</p>`;

  function openInfo(title, html) {
    if (!infoModal || !infoTitle || !infoBody) return;
    infoTitle.textContent = title;
    infoBody.innerHTML = html;
    open(infoModal);
  }
  if (btnAbout)   btnAbout.addEventListener("click", ()=> openInfo("About PAW APP", ABOUT_HTML));
  if (btnPrivacy) btnPrivacy.addEventListener("click", ()=> openInfo("Privacy Policy", PRIVACY_HTML));
  document.querySelectorAll("[data-close-info]").forEach(b => b.addEventListener("click", ()=> close(infoModal)));

})();
