fetch("/me")
  .then(res => res.json())
  .then(data => {
    document.getElementById("user").textContent =
      `Welcome, ${data.username}`;
  });

//Sports extend here
const sports = ["Pickleball", "Badminton"];
const container = document.getElementById("sportsContainer");
const message = document.getElementById("selectedSportMsg");

sports.forEach((sport) => {
  const btn = document.createElement("button");
  btn.textContent = sport;

  btn.onclick = () => {
    message.textContent = `Selected sport: ${sport}`;
  };

  container.appendChild(btn);
});
