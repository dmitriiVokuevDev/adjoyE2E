plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "io.adjoe.qatest.uitests"
    compileSdk = 34

    defaultConfig {
        applicationId = "io.adjoe.qatest.uitests"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // Self-instrumenting: the androidTest APK targets its own package and
        // drives the real QA app (io.adjoe.qatest, see AdjoeTestApp.PACKAGE) black-box
        // via UiAutomator. AllureAndroidJUnitRunner wraps AndroidJUnitRunner to
        // emit Allure results.
        testInstrumentationRunner = "io.qameta.allure.android.runners.AllureAndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildTypes {
        getByName("debug") {
            isDefault = true
        }
    }

    testOptions {
        animationsDisabled = true
    }

    packaging {
        resources.excludes.add("META-INF/*")
    }
}

dependencies {
    androidTestImplementation("com.kaspersky.android-components:kaspresso:1.5.5")
    androidTestImplementation("com.kaspersky.android-components:kaspresso-allure-support:1.5.5")
    androidTestImplementation("androidx.test:runner:1.5.2")
    androidTestImplementation("androidx.test:rules:1.5.0")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")

    // Allure reporting for instrumented tests.
    androidTestImplementation("io.qameta.allure:allure-kotlin-model:2.4.0")
    androidTestImplementation("io.qameta.allure:allure-kotlin-commons:2.4.0")
    androidTestImplementation("io.qameta.allure:allure-kotlin-junit4:2.4.0")
    androidTestImplementation("io.qameta.allure:allure-kotlin-android:2.4.0")
}
