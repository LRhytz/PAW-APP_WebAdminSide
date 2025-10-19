const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function animateNumber(id, end, duration = 800) {
  const el = document.getElementById(id);
  let start = 0;
  if (!el) return;
  if (end === 0) {
    el.innerText = "0";
    return;
  }
  const stepTime = Math.max(Math.floor(duration / end), 20);
  const timer = setInterval(() => {
    start++;
    el.innerText = start;
    if (start >= end) clearInterval(timer);
  }, stepTime);
}

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) {
    window.location = "index.html";
    return;
  }

  const db = firebase.database();

  let role = (localStorage.getItem("sessionRole") || "").toLowerCase();
  try {
    const userSnap = await db.ref("users/" + user.uid).once("value");
    const dbRole = ((userSnap.val() || {}).role || "").toString().toLowerCase();
    if (dbRole) role = dbRole;
    localStorage.setItem("sessionRole", role);
    localStorage.setItem("sessionUid", user.uid);
  } catch (e) {
    console.warn("Could not re-check role from DB; using localStorage:", e);
  }

  if (role !== "organization") {
    window.location = "home.html";
    return;
  }
  let userOrganizationId = user.uid;
  try {
    const orgExists = (
      await db.ref("organizations/" + userOrganizationId).once("value")
    ).exists();
    if (!orgExists) {
      console.warn(
        "No organizations/" +
          userOrganizationId +
          " node. Proceeding with zero counts."
      );
    }
  } catch (error) {
    console.error("Error checking organization node:", error);
  }

  let totalReports = 0,
    inProgressReports = 0,
    completedReports = 0,
    acceptedReports = 0,
    onHoldReports = 0;

  const counts = {
    inProgress: 0,
    completed: 0,
    accepted: 0,
    onHold: 0,
  };

  try {
    const snapshot = await db.ref("reports").once("value");
    const reports = snapshot.val() || {};

    Object.values(reports).forEach((report) => {
      totalReports++;

      const status = (report.status || "").trim().toLowerCase();

      // Count submitted reports that aren't yet assigned to an org
      if (status === "submitted" && !orgIdInReport) {
        submittedReports++;
        counts.submitted++;
      }
      if (
        (status === "in progress" || status === "in_progress") &&
        report.organizationId === userOrganizationId
      ) {
        inProgressReports++;
        counts.inProgress++;
      }
      if (
        status === "completed" &&
        report.organizationId === userOrganizationId
      ) {
        completedReports++;
        counts.completed++;
      }
      if (
        status === "on hold" &&
        report.organizationId === userOrganizationId
      ) {
        onHoldReports++;
        counts.onHold++;
      }
    });

    animateNumber("totalReports", totalReports);
    animateNumber("inProgressReports", inProgressReports);
    animateNumber("completedReports", completedReports);
    animateNumber("acceptedReports", acceptedReports);
    animateNumber("onHoldReports", onHoldReports);

    const chartEl = document.getElementById("reportChart");
    if (chartEl && window.Chart) {
      const ctx = chartEl.getContext("2d");
      new Chart(ctx, {
        type: "bar",
        data: {
          labels: ["Reports"],
          datasets: [
            {
              label: "Submitted Reports",
              data: [counts.submitted],
              backgroundColor: "rgba(76,175,80,0.7)",
              borderRadius: 4,
            },
            {
              label: "In Progress Reports",
              data: [counts.inProgress],
              backgroundColor: "rgba(255,223,51,0.7)",
              borderRadius: 4,
            },
            {
              label: "Completed Reports",
              data: [counts.completed],
              backgroundColor: "rgba(255,192,203,0.7)",
              borderRadius: 4,
            },
            {
              label: "Accepted Reports",
              data: [counts.accepted],
              backgroundColor: "rgba(100,149,237,0.7)",
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          scales: {
            x: { title: { display: true, text: "Reports" } },
            y: {
              beginAtZero: true,
              title: { display: true, text: "Count" },
              ticks: { stepSize: 1 },
            },
          },
          plugins: {
            legend: { position: "top" },
            tooltip: { mode: "index", intersect: false },
          },
        },
      });
    }

    if (window.AOS) AOS.init({ duration: 600, once: true });
  } catch (error) {
    console.error("Error fetching reports data:", error);
  }
});
