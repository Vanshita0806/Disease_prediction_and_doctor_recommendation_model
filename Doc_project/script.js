document.addEventListener("DOMContentLoaded", function () {
    console.log("Page loaded, fetching symptoms...");
    loadSymptoms();
    fetchLocations();
});

function fetchLocations() {
    fetch("http://127.0.0.1:8000/get_locations/")
        .then(response => response.json())
        .then(data => {
            console.log("Locations received:", data.locations); // Debugging
            const locationDropdown = document.getElementById("location-dropdown");
            locationDropdown.innerHTML = '<option value="">-- Select Location --</option>'; // Reset dropdown

            data.locations.forEach(location => {
                const option = document.createElement("option");
                option.value = location;
                option.textContent = location.charAt(0).toUpperCase() + location.slice(1); // Capitalize first letter
                locationDropdown.appendChild(option);
            });
        })
        .catch(error => {
            console.error("Error fetching locations:", error);
            alert("Failed to load locations.");
        });
}

function filterSymptoms() {
    let input = document.getElementById("search-symptoms").value.toLowerCase();
    let symptoms = document.querySelectorAll("#symptom-options div"); // Get all symptom divs

    symptoms.forEach(div => {
        let label = div.querySelector("label").textContent.toLowerCase();
        if (label.includes(input)) {
            div.style.display = "block"; // Show matching symptom
        } else {
            div.style.display = "none"; // Hide non-matching symptom
        }
    });
}

function loadSymptoms() {
    fetch("http://127.0.0.1:8000/symptoms")
        .then(response => {
            console.log("HTTP Status:", response.status); // Log status
            if (!response.ok) {
                throw new Error("Network response was not OK. Status: " + response.status);
            }
            return response.json();
        })
        .then(data => {
            console.log("Symptoms received:", data.symptoms); // Debugging
            let symptomContainer = document.getElementById("symptom-options");
            symptomContainer.innerHTML = ""; // Clear previous options

            if (!data.symptoms || data.symptoms.length === 0) {
                symptomContainer.innerHTML = "<p>No symptoms available</p>";
                return;
            }

            data.symptoms.forEach(symptom => {
                let checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = symptom;
                checkbox.id = `symptom-${symptom}`;

                let label = document.createElement("label");
                label.htmlFor = `symptom-${symptom}`;
                label.textContent = symptom.replace("_", " ");

                let div = document.createElement("div");
                div.classList.add("symptom");
                div.appendChild(checkbox);
                div.appendChild(label);
                symptomContainer.appendChild(div);
            });
        })
        .catch(error => {
            console.error("Error fetching symptoms:", error);
        });
}

function showPredictForm() {
    document.getElementById("landing").style.display = "none";
    document.getElementById("predict-section").style.display = "block";
    loadSymptoms(); // Ensure symptoms load
}

function goBack() {
    document.getElementById("predict-section").style.display = "none";
    document.getElementById("recommend-section").style.display = "none";
    document.getElementById("landing").style.display = "block";
}

function predictDisease() {
    let selectedSymptoms = [];
    document.querySelectorAll("#symptom-options input[type='checkbox']:checked").forEach(checkbox => {
        selectedSymptoms.push(checkbox.value);
    });

    fetch("http://127.0.0.1:8000/predict/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedSymptoms)
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        let resultDiv = document.getElementById("result");
        resultDiv.innerHTML = "<h3>Predicted Diseases:</h3>";
        resultDiv.style.display = "block";

        let topDiseases = [];
        data.predicted_diseases.forEach((disease, index) => {
            resultDiv.innerHTML += `<p>${disease[0]} - ${(disease[1] * 100).toFixed(2)}%</p>`;
            if (index < 2) topDiseases.push(disease[0]); // Store top 2 diseases
        });

        // Store top 2 diseases for later use
        localStorage.setItem("topDiseases", JSON.stringify(topDiseases));

        // Show the button to fetch descriptions & precautions
        document.getElementById("getDescriptionBtn").style.display = "block";
        document.getElementById("recommendDoctorBtn").style.display = "block";
    })
    .catch(error => console.error("Error:", error));
}

// Fetch descriptions and precautions when the button is clicked
document.getElementById("getDescriptionBtn").addEventListener("click", function () {
    const selectedDiseases = JSON.parse(localStorage.getItem("topDiseases")) || [];

    if (selectedDiseases.length === 0) {
        alert("No diseases found! Predict first.");
        return;
    }

    fetch(`http://127.0.0.1:8000/get_description_precautions/?diseases=${selectedDiseases.join("&diseases=")}`)
        .then(response => {
            if (!response.ok) throw new Error("Failed to fetch disease details.");
            return response.json();
        })
        .then(data => {
            let output = "<h3>Disease Descriptions & Precautions</h3>";

            selectedDiseases.forEach(disease => {
                output += `<h4>${disease}</h4>`;
                output += `<p><strong>Description:</strong> ${data.descriptions[disease]}</p>`;
                output += `<p><strong>Precautions:</strong></p><ul>`;
                data.precautions[disease].forEach(precaution => {
                    output += `<li>${precaution}</li>`;
                });
                output += `</ul><hr>`;
            });

            document.getElementById("descriptionResults").innerHTML = output;
            document.getElementById("descriptionResults").style.display = "block";
           
        })
        .catch(error => {
            console.error("Error fetching data:", error);
            alert("Failed to fetch disease details.");
        });
});

function recommendDoctor() {
    const selectedDisease = document.getElementById("disease-dropdown").value;
    const selectedLocation = document.getElementById("location-dropdown").value; // Get location

    if (!selectedDisease) {
        alert("Please select a disease.");
        return;
    }

    if (!selectedLocation) {
        alert("Please select a location.");
        return;
    }

    const url = `http://127.0.0.1:8000/recommend_doctor/?${new URLSearchParams({ 
        diseases: selectedDisease, 
        location: selectedLocation  // Ensure location is sent
    })}`;

    fetch(url)
    .then(response => {
        if (!response.ok) {
            throw new Error("Failed to fetch doctors.");
        }
        return response.json();
    })
    .then(data => {
        console.log("Doctor API Response:", data); // Debugging

        if (!data || !data.recommendations || typeof data.recommendations !== 'object') {
            console.error("Invalid data format:", data);
            alert("Unexpected response from server.");
            return;
        }

        const diseaseName = Object.keys(data.recommendations)[0]; // Extract first disease key
        const doctors = data.recommendations[diseaseName];

        if (!Array.isArray(doctors)) {
            console.error("Doctors data is not an array:", doctors);
            alert("Invalid doctor data format.");
            return;
        }

        displayDoctors(doctors); // Pass doctors array to function
    })
    .catch(error => {
        console.error("Error fetching doctors:", error);
    });
}




function toggleDoctorDetails(index) {
    let detailsDiv = document.getElementById(`doctor-details-${index}`);
    detailsDiv.style.display = detailsDiv.style.display === "none" ? "block" : "none";
}




function showRecommendForm() {
    document.getElementById("landing").style.display = "none";
    document.getElementById("predict-section").style.display = "none";
    document.getElementById("recommend-section").style.display = "block";

    // Load diseases for the dropdown
    loadDiseases();
}

function loadDiseases() {
    let diseases = JSON.parse(localStorage.getItem("topDiseases")) || [];

    let dropdown = document.getElementById("disease-dropdown");
    dropdown.innerHTML = `<option value="">-- Select Disease --</option>`;

    diseases.forEach(disease => {
        let option = document.createElement("option");
        option.value = disease;
        option.textContent = disease;
        dropdown.appendChild(option);
    });

    if (diseases.length === 0) {
        alert("No diseases available. Please predict a disease first.");
    }
}
function fetchDescriptions() {
    const selectedDiseases = JSON.parse(localStorage.getItem("topDiseases")) || [];

    if (selectedDiseases.length === 0) {
        alert("No diseases found! Predict first.");
        return;
    }

    fetch(`http://127.0.0.1:8000/get_description_precautions/?diseases=${selectedDiseases.join("&diseases=")}`)
        .then(response => {
            if (!response.ok) throw new Error("Failed to fetch disease details.");
            return response.json();
        })
        .then(data => {
            let output = "<h3>Disease Descriptions & Precautions</h3>";

            selectedDiseases.forEach(disease => {
                output += `<h4>${disease}</h4>`;
                output += `<p><strong>Description:</strong> ${data.descriptions[disease]}</p>`;
                output += `<p><strong>Precautions:</strong></p><ul>`;
                data.precautions[disease].forEach(precaution => {
                    output += `<li>${precaution}</li>`;
                });
                output += `</ul><hr>`;
            });

            document.getElementById("descriptionResults").innerHTML = output;
        })
        .catch(error => {
            console.error("Error fetching data:", error);
            alert("Failed to fetch disease details.");
        });
}

function displayDoctors(recommendations) {
    let doctorList = document.getElementById("doctor-list");
    doctorList.innerHTML = "<h3>Recommended Doctors</h3>";
    doctorList.style.display="block";

    if (!Array.isArray(recommendations) || recommendations.length === 0) {
        doctorList.innerHTML += "<p>No doctors found.</p>";
        return;
    }

    recommendations.forEach((doctor) => {
        let doctorDiv = document.createElement("div");
        doctorDiv.className = "doctor-card";
        doctorDiv.innerHTML = `
            <p><strong>Name:</strong> ${doctor["Doctor Name"]}</p>
            <button onclick="viewDoctorDetails('${doctor.id}')">View Details</button>
        `;
        doctorList.appendChild(doctorDiv);
    });
}

function viewDoctorDetails(doctorId) {
    window.location.href = `doctor_detail.html?id=${doctorId}`;
}







