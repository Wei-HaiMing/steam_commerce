document.addEventListener("DOMContentLoaded", function () {
  const itemsPerPage = 5; // Number of games per page
  const games = Array.from(document.querySelectorAll(".row.mb-4")); // All game rows
  const paginationContainer = document.createElement("div");
  paginationContainer.className =
    "pagination mt-4 d-flex justify-content-center";

  let currentPage = 1;
  const totalPages = Math.ceil(games.length / itemsPerPage);

  function renderPage(page) {
    // Hide all games
    games.forEach((game, index) => {
      game.style.display = "none";
    });

    // Show games for the current page
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    games.slice(start, end).forEach((game) => {
      game.style.display = "block";
    });

    // Update pagination buttons
    renderPaginationButtons();
  }

  function renderPaginationButtons() {
    paginationContainer.innerHTML = "";

    for (let i = 1; i <= totalPages; i++) {
      const button = document.createElement("button");
      button.className = "btn btn-primary mx-1";
      button.textContent = i;
      button.disabled = i === currentPage;

      button.addEventListener("click", () => {
        currentPage = i;
        renderPage(currentPage);
      });

      paginationContainer.appendChild(button);
    }
  }

  // Add pagination container to the DOM
  document.querySelector(".container").appendChild(paginationContainer);

  // Render the first page
  renderPage(currentPage);
});
