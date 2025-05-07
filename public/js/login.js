document.querySelector("form").addEventListener("submit", function (e) {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  let errorMessage = "";

  if (username.length < 3) {
    errorMessage += "Username must be at least 3 characters long.\n";
  }

  if (password.length < 4) {
    errorMessage += "Password must be at least 4 characters long.\n";
  }

  if (errorMessage) {
    e.preventDefault();
    alert(errorMessage);
  }
});