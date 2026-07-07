package io.adjoe.qatest.uitests

import io.qameta.allure.kotlin.Description
import io.qameta.allure.kotlin.Epic
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Robustness of impression counting under configuration/lifecycle changes.
 *
 * An impression is a single `View` event, emitted once when the ad overlay is
 * opened. Rotating the device or backgrounding/foregrounding the app while the
 * ad is shown are NOT new views, so the impression count must not increase.
 *
 * writer.log is cleared before and after every test, so `totalViews()` reflects
 * only what this test produced.
 */
@Epic("Ad lifecycle robustness")
class FullScreenAdLifecycleChecks : BaseUiTest() {

    @Before
    fun clearLogBefore() = WriterLog.clear()

    @After
    fun clearLogInTeardown() = WriterLog.clear()

    @Test
    @Description(
        "Requirement: an impression (View) is counted once per ad display. Rotating the " +
            "device while the ad is shown is a configuration change, not a new view — the " +
            "impression count must not increase.",
    )
    fun rotating_during_ad_does_not_add_an_impression() = run {
        step("Open the ad — one impression") {
            AdjoeTestApp.launch()
            AdjoeTestApp.openAd()
        }
        step("Wait until the impression is recorded") {
            assertEquals("exactly one impression after opening", 1, WriterLog.awaitTotalViews(1).totalViews())
        }
        step("Rotate the device to landscape while the ad is shown") {
            AdjoeTestApp.rotateLandscape()
        }
        step("The ad is still shown and the impression count is unchanged") {
            assertTrue("ad overlay should survive rotation", AdjoeTestApp.isAdShown())
            assertEquals("rotation must not add an impression", 1, WriterLog.readAfterSettle().totalViews())
        }
        step("Restore portrait") {
            AdjoeTestApp.rotatePortrait()
        }
    }

    @Test
    @Description(
        "Requirement: backgrounding and foregrounding the app while an ad is shown is a " +
            "lifecycle event, not a new View — the impression count must not increase.",
    )
    fun backgrounding_and_foregrounding_does_not_add_an_impression() = run {
        step("Open the ad — one impression") {
            AdjoeTestApp.launch()
            AdjoeTestApp.openAd()
        }
        step("Wait until the impression is recorded") {
            assertEquals("exactly one impression after opening", 1, WriterLog.awaitTotalViews(1).totalViews())
        }
        step("Send the app to the background (Home)") {
            AdjoeTestApp.background()
        }
        step("Bring the app back to the foreground") {
            AdjoeTestApp.foreground()
        }
        step("The impression count is unchanged") {
            assertEquals(
                "background/foreground must not add an impression",
                1,
                WriterLog.readAfterSettle().totalViews(),
            )
        }
    }
}
