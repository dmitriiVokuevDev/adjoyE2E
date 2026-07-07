package io.adjoe.qatest.uitests

import com.kaspersky.components.alluresupport.withAllureSupport
import com.kaspersky.kaspresso.kaspresso.Kaspresso
import com.kaspersky.kaspresso.testcases.api.testcase.TestCase

/**
 * Base for the UI tests. Enables Kaspresso's Allure integration so every
 * `step(...)` becomes an Allure step and a screenshot is attached on failure.
 */
@Suppress("DEPRECATION")
abstract class BaseUiTest : TestCase(
    kaspressoBuilder = Kaspresso.Builder.withAllureSupport(),
)
