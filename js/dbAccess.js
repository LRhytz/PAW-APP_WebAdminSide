// js/dbAccess.js  (Firebase v8 compatible)
(function (global) {
  const db = () => firebase.database();
  const auth = () => firebase.auth();

  async function waitForAuthUser() {
    if (auth().currentUser) return auth().currentUser;
    await new Promise((resolve) => {
      const unsub = auth().onAuthStateChanged((u) => {
        unsub();
        resolve(u || null);
      });
    });
    return auth().currentUser;
  }

  // Accept either a bare boolean true OR an object { isAdmin: true }
  async function isAdmin(uid) {
    if (!uid) return false;
    const snap = await db().ref(`admins/${uid}`).once("value");
    const v = snap.val();
    return v === true || (v && v.isAdmin === true);
  }

  // ---- Public helpers ----

  // Get the signed-in user's node: users/<uid>
  async function getMyUserNode() {
    const user = await waitForAuthUser();
    if (!user) throw new Error("Not signed in");
    const snap = await db().ref(`users/${user.uid}`).once("value");
    return { uid: user.uid, exists: snap.exists(), val: () => snap.val() };
  }

  // Admin-only: list or query users. Non-admins will throw.
  // options: { orderByChild?: string, equalTo?: any, startAt?: any, endAt?: any, limitToFirst?: number, limitToLast?: number }
  async function getUsersList(options = {}) {
    const user = await waitForAuthUser();
    if (!user) throw new Error("Not signed in");
    const admin = await isAdmin(user.uid);
    if (!admin) throw new Error("Permission denied: only admins can list users");

    let q = db().ref("users");
    if (options.orderByChild) q = q.orderByChild(options.orderByChild);
    if ("equalTo" in options) q = q.equalTo(options.equalTo);
    if ("startAt" in options) q = q.startAt(options.startAt);
    if ("endAt" in options) q = q.endAt(options.endAt);
    if ("limitToFirst" in options) q = q.limitToFirst(options.limitToFirst);
    if ("limitToLast" in options) q = q.limitToLast(options.limitToLast);

    const snap = await q.once("value");
    return snap; // use snap.forEach(...) or snap.val()
  }

  // Safe wrapper: returns either the admin list (if admin) OR only my node.
  async function getUsersSafe(optionsIfAdmin = null) {
    const user = await waitForAuthUser();
    if (!user) throw new Error("Not signed in");
    const admin = await isAdmin(user.uid);
    if (admin) {
      return { admin, snap: await getUsersList(optionsIfAdmin || {}) };
    } else {
      const mine = await db().ref(`users/${user.uid}`).once("value");
      return { admin, snap: mine };
    }
  }

  // Expose globally
  global.DB = { waitForAuthUser, isAdmin, getMyUserNode, getUsersList, getUsersSafe };
})(window);
