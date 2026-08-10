## Best Purpose

This screen is the main emergency incident reporting interface for the UIRS mobile application. Its primary purpose is to let users quickly report an incident, attach supporting media, capture accurate location data, and send the report to the appropriate emergency stations even when the network is weak or unavailable.

## What This Screen Does

ReportIncident acts as a smart incident intake form. It guides the user through reporting an emergency by collecting:

- Incident type and subtype
- Description of the event
- Live or saved location
- Timestamp of the report
- Current image evidence
- Medical emergency details when applicable

## Key Features

### 1. Incident Reporting Form

- Supports multiple incident categories such as Accident, Crime, Fire, Medical Emergency, Natural Disaster, Rescue, Hazardous Materials, and Others.
- Provides detailed subtypes for each category.
- Allows users to select the incident clearly through the dropdown Selection.

### 2. Live Location Tracking

- Requests location permission from the user.
- Tracks the user's current GPS position in real time.
- Converts coordinates into a readable address when possible.
- Saves the most recent location for reuse.

### 3. Media Capture and Attachment

- Lets users open the camera and take photos.
- Compresses images before upload.
- Supports preview of attached media.

### 4. Smart Station Assignment

- Suggests nearby stations based on the selected incident type.
- Uses keyword detection from the description to identify relevant emergency station categories.
- Helps route reports to the most relevant responders.

### 5. Medical Emergency Support

- Displays extra fields for medical emergencies such as consciousness status, patient name, age, and gender.
- Makes the form more useful for urgent healthcare response.

### 6. Online and Offline Submission Handling

- Attempts online submission when internet is available.
- Checks connectivity and network quality before sending data.
- If the app is offline or submission fails, it stores the report in a queue for later retry.
- Can send an SMS report when offline.

### 7. Duplicate Report Protection

- Checks whether a similar report may already exist.
- Prevents accidental duplicate incident entries.

### 8. Queue Management

- Shows queued reports waiting to be submitted.
- Allows users to retry pending reports manually.

## Capabilities

This screen is more than a simple form. It combines several capabilities into one workflow:

- Fast emergency input for responders and civilians
- GPS-based location awareness
- Intelligent routing using ML to emergency stations
- Media evidence handling
- Offline resilience for unreliable connectivity
- Duplicate suppression
- Multilingual support through translation hooks
- Role-based navigation after successful submission

## Expected Behavior / Predictions

When used properly, this screen is expected to:

- Reduce reporting delays during emergencies
- Improve the accuracy of incident location data
- Increase the chance that reports reach the right responders
- Preserve incident reports when the device is offline
- Make medical and critical incident submissions more detailed and actionable

## Best Use Cases

This screen is best used for:

- Immediate incident reporting by citizens
- Field reporting by responders
- Emergency situations where quick and reliable submission matters
- Situations where network quality is unstable

## changes && Protection in reporting incident

- Duplicate Prevention for same user .
- Duplicate prevention (other user) for the same incident that has the same data and coverage of 200 meters.
- After the incident mark as done , It sets a cooldown for 30 mins before creating a new report . (if the cooldown is unfinish , duplicate data will be merge , but if the cooldown is off then the new incidnet is created even the incidnet is thesame).
- I implement the Machine learning to predict the severity of the incident based on trained data of the previous reports . This includes the random forest algorithm for training the model and pandas for data manipulation .
- Detects nearest station based on the reports type then checks the station capability to most likely the higher backup they provide then sends the alert one by one for each station that can be involved in that report . Then if the station capability is lower than the required capability requested by the model , if finds another same station and request for another backup .

## FCM and Socket for alarms

- After a responder successfully logs into the application, the authentication information is securely stored using SharedPreferences through the SharedPrefModule. At the same time, the SocketService is started so the device begins listening for incoming emergency incidents.
- When an emergency is reported, the backend immediately broadcasts the incident through both Socket.IO and Firebase Cloud Messaging. Using two communication channels increases the likelihood that the alert reaches responders without delay.
- The application receives the incident through either the SocketService or the MyFirebaseMessagingService. Both components forward the event to the EventDeduplicator before any alarm is triggered.
- The EventDeduplicator examines the incoming incident to determine whether it has already been processed. If the event is identified as a duplicate, it is ignored. If it is a new incident, the alert proceeds to the next stage.
- The EmergencyAlertService is launched as a foreground service. It immediately begins playing the emergency siren, activates continuous vibration, flashes the device's flashlight, and displays a persistent emergency notification to capture the responder's attention.
- Simultaneously, the EmergencyAlertActivity opens as a full-screen interface presenting detailed information about the reported incident. This allows responders to quickly review the situation and decide whether to accept, decline, or acknowledge the emergency request.
- If the responder interacts with notification actions instead of the full-screen interface, the NotificationActionReceiver processes those commands, ensuring that alarm controls continue to function correctly under all circumstances.
- Once the responder makes a decision, the application transmits the response back to the backend server. This updates the incident status and informs dispatch personnel of the responder's availability and chosen action.
