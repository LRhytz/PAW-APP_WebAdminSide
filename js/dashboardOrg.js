const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function animateNumber(id, end, duration = 800) {
  const el = document.getElementById(id);
  let start = 0;
  if (end === 0) return (el.innerText = "0");
  const stepTime = Math.max(Math.floor(duration / end), 20);
  const timer = setInterval(() => {
    start++;
    el.innerText = start;
    if (start >= end) clearInterval(timer);
  }, stepTime);
}

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) return (window.location = "index.html");

  const db = firebase.database();
  const orgRef = db.ref("organizations").child(user.uid);

  let userOrganizationId = null;

  try {
    const snapshot = await orgRef.once("value");
    const orgData = snapshot.val();
    if (orgData) {
      userOrganizationId = user.uid;
    } else {
      return (window.location = "index.html");
    }
  } catch (error) {
    console.error("Error fetching organization data:", error);
    return;
  }

  let totalReports = 0,
    submittedReports = 0,
    inProgressReports = 0,
    completedReports = 0,
    acceptedReports = 0;

  const counts = {
    submitted: 0,
    inProgress: 0,
    completed: 0,
    accepted: 0,
  };

  try {
    const snapshot = await db.ref("reports").once("value");
    const reports = snapshot.val() || {};

    Object.values(reports).forEach((report) => {
      totalReports++;

      const status = report.status?.trim().toLowerCase();

      if (status === "submitted") {
        submittedReports++;
        counts.submitted++;
      }

      if (
        status === "in progress" &&
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
        status === "accepted" &&
        report.organizationId === userOrganizationId
      ) {
        acceptedReports++;
        counts.accepted++;
      }
    });

    animateNumber("totalReports", totalReports);
    animateNumber("submittedReports", submittedReports);
    animateNumber("inProgressReports", inProgressReports);
    animateNumber("completedReports", completedReports);
    animateNumber("acceptedReports", acceptedReports);

    const ctx = document.getElementById("reportChart").getContext("2d");
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

    if (window.AOS) AOS.init({ duration: 600, once: true });
  } catch (error) {
    console.error("Error fetching reports data:", error);
  }
});
