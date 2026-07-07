package io.adjoe.qatest.uitests

import io.qameta.allure.kotlin.Description
import io.qameta.allure.kotlin.Epic
import io.qameta.allure.kotlin.Issue
import io.qameta.allure.kotlin.Severity
import io.qameta.allure.kotlin.SeverityLevel
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@Epic("Ad event tracking")
class FullScreenAdChecks : BaseUiTest() {

    @Before
    fun clearLogBefore() = WriterLog.clear()

    @After
    fun clearLogInTeardown() = WriterLog.clear()

    @Test
    @Issue("BUG-4")
    @Severity(SeverityLevel.NORMAL)
    @Description(
        "Requirement (OpenAPI Toasts.session_ended): \"Must contain the placeholder {n}, " +
            "which the SDK replaces with the number of clicks the user made during the " +
            "session. Conventionally 'Session Ended: {n} clicks'.\"",
    )
    fun cached_config_session_ended_template_contains_placeholder() = run {
        step("Launch and read the cached-config session_ended template") {
            AdjoeTestApp.launch()
            val template = AdjoeTestApp.cachedSessionEndedTemplate()
            testLogger.i("cached session_ended = \"$template\"")
            assertTrue(
                "session_ended must contain the {n} placeholder, but was: \"$template\"",
                template.contains("{n}"),
            )
        }
    }

    @Test
    @Description(
        "Requirement (README): \"a view event happens every time a user watches an ad… " +
            "An ad can have at most one view per session.\" Tapping View ad sends a view event.",
    )
    fun a_view_produces_exactly_one_view_event() = run {
        step("Drive: open the ad, then dismiss with Back (no ad taps)") {
            AdjoeTestApp.launch()
            AdjoeTestApp.openAd()
            AdjoeTestApp.closeAdViaBack()
        }
        lateinit var sessionId: String
        step("Find the ad session id from the app") {
            sessionId = AdjoeTestApp.currentSessionId()
            testLogger.i("session id = $sessionId")
        }
        step("Assert writer.log recorded 1 View and 0 Clicks for $sessionId") {
            val log = WriterLog.awaitSession(sessionId)
            assertEquals("expected exactly one View event", 1, log.views(sessionId))
            assertEquals("no ad was tapped, so no Click expected", 0, log.clicks(sessionId))
        }
    }

    @Test
    @Description(
        "Requirement (README): \"Tapping the ad itself sends a click event tied to the same " +
            "session\" and \"an ad can have multiple clicks per session.\" N taps ⇒ N clicks.",
    )
    fun three_ad_taps_produce_three_click_events() = run {
        val taps = 3
        step("Drive: open the ad, tap it $taps times, dismiss with Back") {
            AdjoeTestApp.launch()
            AdjoeTestApp.openAd()
            AdjoeTestApp.clickAd(taps)
            AdjoeTestApp.closeAdViaBack()
        }
        lateinit var sessionId: String
        step("Find the ad session id from the app") {
            sessionId = AdjoeTestApp.currentSessionId()
            testLogger.i("session id = $sessionId")
        }
        step("Assert writer.log recorded 1 View and $taps Clicks for $sessionId") {
            val log = WriterLog.awaitSession(sessionId)
            assertEquals("expected exactly one View event", 1, log.views(sessionId))
            assertEquals("$taps ad taps must yield $taps Click events", taps, log.clicks(sessionId))
        }
    }

    @Test
    @Description(
        "Requirement (README): \"Every fresh tap of View ad starts a new session, new id, " +
            "new view, new overlay.\" Two cycles ⇒ two distinct session ids.",
    )
    fun each_view_ad_tap_starts_a_new_session() = run {
        lateinit var first: String
        lateinit var second: String
        step("First View ad cycle (open -> Back)") {
            AdjoeTestApp.launch()
            AdjoeTestApp.openAd()
            AdjoeTestApp.closeAdViaBack()
            first = AdjoeTestApp.currentSessionId()
        }
        step("Second View ad cycle (open -> Back)") {
            AdjoeTestApp.openAd()
            AdjoeTestApp.closeAdViaBack()
            second = AdjoeTestApp.currentSessionId()
        }
        step("The two sessions must be distinct and both recorded") {
            testLogger.i("session ids: $first vs $second")
            assertNotEquals("each View ad tap must start a new session", first, second)
            val log = WriterLog.awaitSession(second)
            assertEquals("first session's view recorded", 1, log.views(first))
            assertEquals("second session's view recorded", 1, log.views(second))
        }
    }

    @Test
    @Issue("BUG-1")
    @Severity(SeverityLevel.CRITICAL)
    @Description(
        "Requirement (README): only \"tapping the ad itself sends a click event\"; \"tapping " +
            "the X in the corner closes the overlay.\" Dismissing must not record a click.",
    )
    fun closing_with_x_must_not_record_a_click() = run {
        step("Drive: open the ad, tap nothing, dismiss with the X") {
            AdjoeTestApp.launch()
            AdjoeTestApp.openAd()
            AdjoeTestApp.closeAd()
        }
        lateinit var sessionId: String
        step("Find the ad session id from the app") {
            sessionId = AdjoeTestApp.currentSessionId()
            testLogger.i("session id = $sessionId")
        }
        step("Assert writer.log recorded 1 View and 0 Clicks for $sessionId") {
            val log = WriterLog.awaitSession(sessionId)
            assertEquals("expected exactly one View event", 1, log.views(sessionId))
            assertEquals(
                "closing via X must not record a click (BUG-1: phantom click)",
                0,
                log.clicks(sessionId),
            )
        }
    }
}
