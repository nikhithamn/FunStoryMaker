let lastActivityTime = Date.now();
const inactivityLimit = 30 * 60 * 1000; // 1 minute
let isLoggedOut = false; // Flag to prevent multiple alerts

function resetTimer() {
  lastActivityTime = Date.now();
}

function checkInactivity() {
  const currentTime = Date.now();
  if (currentTime - lastActivityTime >= inactivityLimit) {
    handleInactivityLogout();
  }
}

function handleInactivityLogout() {
  const currentUrl = window.location.pathname;
  if (isLoggedOut || currentUrl === "/public-page") return; // Prevent multiple alerts

  isLoggedOut = true;
  localStorage.removeItem("token");
  alert("Session expired. You have been logged out.");
  updateAuthButtons();
  window.location.href = "login"; // Redirect to login page
}

function logout() {
  localStorage.removeItem("token");
  isLoggedOut = true; // Set flag to prevent duplicate alerts
  alert("Logged out successfully!");
  updateAuthButtons();
  window.location.href = "login"; // Redirect to login page
}

// Initialize session management
document.addEventListener("mousemove", resetTimer);
document.addEventListener("keypress", resetTimer);
setInterval(checkInactivity, 10000); // Check every 10 seconds
