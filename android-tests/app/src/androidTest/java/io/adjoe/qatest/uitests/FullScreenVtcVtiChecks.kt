package io.adjoe.qatest.uitests

import io.qameta.allure.kotlin.Description
import io.qameta.allure.kotlin.Epic
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@Epic("Reader ratios")
class FullScreenVtcVtiChecks : BaseUiTest() {

    private val eps = 1e-6

    @Before
    fun clearBefore() = Reader.clearLog()

    @After
    fun clearInTeardown() = Reader.clearLog()

    @Test
    @Description(
        "Requirement (README/reader.proto): the reader returns the \"view-to-click ratio " +
            "(vtc)\". Derived from \"zero rather than undefined when no views exist\", views is " +
            "the denominator ⇒ vtc = clicks / views.",
    )
    fun vtc_value_equals_clicks_over_views() = run {
        step("Seed the window: one view with two ad taps (Back close, no phantom)") {
            AdjoeTestApp.launch()
            AdjoeTestApp.openAd()
            AdjoeTestApp.clickAd(2)
            AdjoeTestApp.closeAdViaBack()
        }
        lateinit var published: Number
        step("Ask the reader for vtc on ad-001/android") {
            published = Reader.ratio("vtc")
        }
        step("Assert reader.log shows value == other / views, with views in 1..10") {
            val line = Reader.log().latest("vtc") ?: error("no vtc line in reader.log")
            assertTrue("window invariant: views must be 1..10 but was ${line.views}", line.views in 1..10)
            assertEquals("published value must match the logged value", published.toDouble(), line.value, eps)
            assertEquals(
                "vtc must equal other/views (${line.other}/${line.views})",
                line.other.toDouble() / line.views,
                line.value,
                eps,
            )
        }
    }

    @Test
    @Description(
        "Requirement (README/reader.proto): the reader returns the \"view-to-installation " +
            "ratio (vti)\". Installs are simulated by the backend ⇒ vti = installs / views " +
            "(asserted as an invariant, not a fixed value).",
    )
    fun vti_value_equals_installs_over_views() = run {
        step("Seed the window: one view (Back close)") {
            AdjoeTestApp.launch()
            AdjoeTestApp.openAd()
            AdjoeTestApp.closeAdViaBack()
        }
        lateinit var published: Number
        step("Ask the reader for vti on ad-001/android") {
            published = Reader.ratio("vti")
        }
        step("Assert reader.log shows value == other / views, with views in 1..10") {
            val line = Reader.log().latest("vti") ?: error("no vti line in reader.log")
            assertTrue("window invariant: views must be 1..10 but was ${line.views}", line.views in 1..10)
            assertEquals("published value must match the logged value", published.toDouble(), line.value, eps)
            assertEquals(
                "vti must equal other/views (${line.other}/${line.views})",
                line.other.toDouble() / line.views,
                line.value,
                eps,
            )
        }
    }

    @Test
    @Description(
        "Requirement (README): \"Views are stored in a sliding window of size 10 per " +
            "ad/platform.\" Both ratios are computed over that same window ⇒ equal view counts.",
    )
    fun vtc_and_vti_share_the_same_view_window() = run {
        step("Seed the window: one view (Back close)") {
            AdjoeTestApp.launch()
            AdjoeTestApp.openAd()
            AdjoeTestApp.closeAdViaBack()
        }
        step("Read vtc then vti for the same ad") {
            Reader.ratio("vtc")
            Reader.ratio("vti")
        }
        step("Both ratios must be computed over the same number of views") {
            val vtc = Reader.log().latest("vtc") ?: error("no vtc line")
            val vti = Reader.log().latest("vti") ?: error("no vti line")
            assertEquals("vtc and vti must use the same view window", vtc.views, vti.views)
        }
    }

    @Test
    @Description(
        "Requirement (reader.proto): \"When no views exist… the value is zero rather than " +
            "undefined.\" With views but zero clicks, vtc must reflect reality: 0.0.",
    )
    fun ten_sessions_without_clicks_make_vtc_zero() = run {
        step("Drive 10 ad sessions, tapping the ad zero times (Back dismiss)") {
            repeat(10) {
                AdjoeTestApp.launch()
                AdjoeTestApp.openAd()
                AdjoeTestApp.closeAdViaBack()
            }
        }
        step("Reader vtc for ad-001 must be exactly 0.0") {
            val vtc = Reader.ratio("vtc")
            val line = Reader.log().latest("vtc") ?: error("no vtc line")
            assertEquals("all 10 windowed views have 0 clicks", 0, line.other)
            assertEquals("vtc must be 0.0 when the ad was never tapped", 0.0, vtc, eps)
        }
    }
}
