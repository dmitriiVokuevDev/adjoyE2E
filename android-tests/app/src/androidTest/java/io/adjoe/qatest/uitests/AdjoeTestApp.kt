package io.adjoe.qatest.uitests

import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.util.regex.Pattern

/**
 * Thin black-box driver for the real QA Test App (io.adjoe.qatest).
 *
 * We do NOT have the app source or its signing key, so Espresso cannot
 * instrument it. Everything here goes through UiAutomator (accessibility
 * layer), which works cross-process against a foreign release APK.
 *
 * The app assigns no resource-ids, so every selector is by visible text or
 * content-description, discovered via `uiautomator dump`.
 */
object AdjoeTestApp {
    const val PACKAGE = "io.adjoe.qatest"
    private const val ACTIVITY = "io.adjoe.qatest.MainActivity"
    private const val TIMEOUT = 10_000L

    private val device: UiDevice
        get() = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

    private val viewAdButton: BySelector = By.text("View ad")
    private val adCreative: BySelector = By.desc("Advertisement creative")
    private val closeButton: BySelector = By.text("×") // the "×" glyph
    private val uuidPattern: Pattern =
        Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

    /** Cold-launch the app from the home screen and wait for the View ad button. */
    fun launch() {
        device.pressHome()
        device.executeShellCommand("am force-stop $PACKAGE")
        device.executeShellCommand("am start -n $PACKAGE/$ACTIVITY")
        check(device.wait(Until.hasObject(viewAdButton), TIMEOUT)) {
            "Home screen never showed the 'View ad' button"
        }
    }

    /** Tap "View ad" and wait for the ad overlay to appear. */
    fun openAd() {
        device.findObject(viewAdButton).click()
        check(device.wait(Until.hasObject(adCreative), TIMEOUT)) {
            "Ad overlay ('Advertisement creative') never appeared after tapping View ad"
        }
    }

    /** Tap the ad creative [count] times; each tap should emit one Click event. */
    fun clickAd(count: Int) {
        repeat(count) {
            device.findObject(adCreative).click()
            device.waitForIdle(500)
        }
    }

    /** Dismiss the overlay via the X and wait for the home screen to return. */
    fun closeAd() {
        device.findObject(closeButton).click()
        check(device.wait(Until.hasObject(viewAdButton), TIMEOUT)) {
            "Home screen did not return after closing the overlay"
        }
    }

    /** True if the ad overlay is currently on screen. */
    fun isAdShown(): Boolean = device.hasObject(adCreative)

    /** Rotate the device to landscape (a configuration change). */
    fun rotateLandscape() {
        device.setOrientationLeft()
        device.waitForIdle()
    }

    /** Restore natural portrait orientation and hand rotation back to the system. */
    fun rotatePortrait() {
        device.setOrientationNatural()
        device.unfreezeRotation()
        device.waitForIdle()
    }

    /** Send the app to the background (Home). */
    fun background() {
        device.pressHome()
        device.waitForIdle()
    }

    /** Bring the app back to the foreground via its launcher intent. */
    fun foreground() {
        device.executeShellCommand(
            "am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER " +
                "-n $PACKAGE/$ACTIVITY",
        )
        check(device.wait(Until.hasObject(By.pkg(PACKAGE).depth(0)), TIMEOUT)) {
            "App did not return to the foreground"
        }
    }

    /** Dismiss the overlay with the system Back button (does NOT touch the X). */
    fun closeAdViaBack() {
        device.pressBack()
        check(device.wait(Until.hasObject(viewAdButton), TIMEOUT)) {
            "Home screen did not return after pressing Back"
        }
    }

    /** Read the "Last active session" UUID from the home-screen status panel. */
    fun currentSessionId(): String {
        device.wait(Until.hasObject(By.text(uuidPattern)), TIMEOUT)
        val node = device.findObject(By.text(uuidPattern))
            ?: error("No session UUID visible on the status panel")
        return node.text
    }

    /**
     * Read the cached-config `session_ended` template shown in the status panel
     * (the text starting with "Session Ended"). This is the config value the
     * SDK interpolates into the end-of-session toast.
     */
    fun cachedSessionEndedTemplate(): String {
        device.wait(Until.hasObject(By.textStartsWith("Session Ended")), TIMEOUT)
        val node = device.findObject(By.textStartsWith("Session Ended"))
            ?: error("Status panel did not show a 'Session Ended' template")
        return node.text
    }
}
