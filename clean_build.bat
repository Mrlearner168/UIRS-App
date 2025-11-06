@echo off
echo === Cleaning build directories ===
if exist node_modules rd /s /q node_modules
if exist .expo rd /s /q .expo
if exist android\build rd /s /q android\build
if exist android\.gradle rd /s /q android\.gradle

echo === Reinstalling dependencies ===
call npm install

echo === Running expo prebuild ===
call npx expo prebuild --clean

echo === Cleaning Android gradle build ===
cd android
call gradlew clean
cd ..

echo === Running /gradlew assembleDebug --warning-mode all --stacktrace ===
cd android
call .\gradlew assembleDebug --warning-mode all --stacktrace
cd ..
echo === Starting EAS build ===
call eas build --profile development --platform android 

echo === Done ===
pause
