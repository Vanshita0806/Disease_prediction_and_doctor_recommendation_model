from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import pickle
import numpy as np
import pandas as pd
from typing import List
from sklearn.preprocessing import MinMaxScaler

# Load the saved model
with open("disease_prediction_model.pkl", "rb") as file:
    model = pickle.load(file)

# Load symptoms dictionary
with open("symptoms_dict.pkl", "rb") as file:
    symptoms_dict = pickle.load(file)

# Load diseases list dictionary
with open("diseases_list.pkl", "rb") as file:
    diseases_list = pickle.load(file)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow requests from any frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "Welcome to Disease Prediction API"}

@app.get("/symptoms/")
def get_symptoms():
    """
    Returns a list of all available symptoms.
    """
    return {"symptoms": list(symptoms_dict.keys())}

@app.post("/predict/")
def predict_disease(symptoms: List[str]):  # Expecting a list directly
    """
    This function predicts the top 5 diseases based on input symptoms.
    """
    patient_symptoms = [symptom.lower().replace(" ", "_") for symptom in symptoms]  # ✅ Use symptoms directly
    input_vector = np.zeros(len(symptoms_dict))

    for symptom in patient_symptoms:
        if symptom in symptoms_dict:
            input_vector[symptoms_dict[symptom]] = 1
        else:
            print(f"Warning: Symptom '{symptom}' not found in training data.")

    # Get probabilities from the model
    predicted_probs = model.predict_proba([input_vector])[0]

    # Map probabilities to disease names
    predicted_diseases = {
        diseases_list[label]: prob
        for label, prob in enumerate(predicted_probs) if prob > 0.01
    }

    # Sort diseases by probability in descending order
    sorted_diseases = sorted(predicted_diseases.items(), key=lambda x: x[1], reverse=True)[:5]

    return {"predicted_diseases": sorted_diseases}

df_description = pd.read_csv("symptom_Description.csv")
df_precautions = pd.read_csv("symptom_precaution.csv")
speciality_df = pd.read_csv("disease_speciality.csv")
doctor_df = pd.read_csv("corrected_doctor_dataset.csv")
doctor_df.rename(columns={'Consultation Fee ($)': 'Consultation Fee'}, inplace=True)
rec_df = pd.merge(doctor_df, speciality_df, on="Specialization")

from sklearn.impute import SimpleImputer
# Handle missing values
imputer = SimpleImputer(strategy="most_frequent")
df_precautions[["Precaution_1", "Precaution_2", "Precaution_3","Precaution_4"]] = imputer.fit_transform(df_precautions[["Precaution_1", "Precaution_2", "Precaution_3", "Precaution_4"]])

def disease_description(input_disease):
    description_dict = {}
    for disease in input_disease:
        description = df_description[df_description["Disease"] == disease]["Description"].tolist()
        description_dict[disease] = description[0] if description else "Description not found"
    return description_dict

def get_precautions(disease_list):
    precautions_dict = {}
    for disease in disease_list:
        precautions = df_precautions[df_precautions["Disease"] == disease].values.flatten().tolist()[1:]
        precautions_dict[disease] = [p for p in precautions if pd.notna(p)]
    return precautions_dict

@app.get("/get_description_precautions/")
async def get_description_precautions(diseases: list[str] = Query(...)):
    descriptions = disease_description(diseases)
    precautions = get_precautions(diseases)
    
    return {"descriptions": descriptions, "precautions": precautions}


C = rec_df["Patient Rating"].mean()
m = rec_df["Number of Ratings"].quantile(0.25)
rec_df["weighted_avg"] = (rec_df["Patient Rating"] * rec_df["Number of Ratings"] + C * m) / (rec_df["Number of Ratings"] + m)


scaler = MinMaxScaler()
rec_df[["normalized_exp", "norm_weighted_avg"]] = scaler.fit_transform(rec_df[["Experience (Years)", "weighted_avg"]])


rec_df["Score"] = rec_df["norm_weighted_avg"] * 0.7 + rec_df["normalized_exp"] * 0.3


@app.get("/recommend_doctor/")
def recommend_doctors(
    diseases: List[str] = Query(..., description="List of diseases"),
    location: str = Query(..., description="User's location")
):
    recommendations = {}

    for disease in diseases:
        filtered_doctors = rec_df[rec_df["Disease"].str.lower() == disease.lower()]

        if location:
            filtered_doctors = filtered_doctors[filtered_doctors["Location"].str.lower() == location.lower()]

        if not filtered_doctors.empty:
            ranked_doctors = filtered_doctors.sort_values(by="Score", ascending=False).head(5)
        else:
            ranked_doctors = []

        # Convert doctors to a list of dictionaries, ensuring each has a unique "id"
        doctor_list = ranked_doctors.to_dict(orient="records") if not ranked_doctors.empty else []
        
        # Add a unique ID to each doctor (assuming an 'ID' column exists, else generate an index-based ID)
        for idx, doctor in enumerate(doctor_list):
            doctor["id"] = doctor.get("Doctor ID", idx + 1)  # Use "ID" column if available, else index

        recommendations[disease] = doctor_list

    return {"recommendations": recommendations}

@app.get("/get_doctor_details/")
def get_doctor_details(id: str = Query(..., description="Doctor ID")):
    doctor = rec_df[rec_df["Doctor ID"].str.lower() == id.lower()]
    if doctor.empty:
        return {}
    return doctor.iloc[0].to_dict()

@app.get("/get_all_diseases")
def get_all_diseases():
    if isinstance(diseases_list, dict):  # Check if it's a dictionary
        diseases = list(diseases_list.values())  # Extract values as a list
    elif isinstance(diseases_list, list):  # If already a list, use it
        diseases = diseases_list
    else:
        diseases = []  # Fallback to empty list if type is unknown

    return {"diseases": diseases}  # Return a proper list

@app.get("/get_locations/")
def get_locations():
    unique_locations = rec_df["Location"].dropna().str.strip().str.lower().unique().tolist()
    return {"locations": unique_locations}
