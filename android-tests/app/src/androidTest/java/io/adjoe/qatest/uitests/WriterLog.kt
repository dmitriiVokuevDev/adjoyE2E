package io.adjoe.qatest.uitests

import java.net.HttpURLConnection
import java.net.URL

// 10.0.2.2 is the host machine as seen from the Android emulator.
private const val AGENT = "http://10.0.2.2:8090"

internal fun agentRequest(method: String, path: String): String {
    val conn = (URL(AGENT + path).openConnection() as HttpURLConnection).apply {
        requestMethod = method
        connectTimeout = 3_000
        readTimeout = 20_000
        if (method == "POST") doOutput = true
    }
    return try {
        if (method == "POST") conn.outputStream.close()
        conn.inputStream.bufferedReader().use { it.readText() }
    } finally {
        conn.disconnect()
    }
}

/**
 * Test-side client for the backend writer.log, served by the host log-agent.
 * Used to clear the log in teardown and read it back after driving the UI, so a
 * test can assert what the backend recorded for its own session id.
 */
object WriterLog {
    private const val SETTLE_MS = 1_200L

    fun clear() { agentRequest("POST", "/clear/writer") }

    fun read(): Snapshot = Snapshot(agentRequest("GET", "/log/writer").split("\n"))

    /**
     * Wait until the View for [sessionId] is written, let any trailing clicks
     * settle, then return the final snapshot — makes counts deterministic
     * despite the async UI -> backend hop.
     */
    fun awaitSession(sessionId: String, timeoutMs: Long = 8_000L): Snapshot {
        val deadline = System.currentTimeMillis() + timeoutMs
        var snap = read()
        while (snap.views(sessionId) == 0 && System.currentTimeMillis() < deadline) {
            Thread.sleep(200)
            snap = read()
        }
        Thread.sleep(SETTLE_MS)
        return read()
    }

    /** Wait until at least [expected] View events (any session) are recorded. */
    fun awaitTotalViews(expected: Int, timeoutMs: Long = 8_000L): Snapshot {
        val deadline = System.currentTimeMillis() + timeoutMs
        var snap = read()
        while (snap.totalViews() < expected && System.currentTimeMillis() < deadline) {
            Thread.sleep(200)
            snap = read()
        }
        Thread.sleep(SETTLE_MS)
        return read()
    }

    /** Let any pending events land, then return the current snapshot. */
    fun readAfterSettle(): Snapshot {
        Thread.sleep(SETTLE_MS)
        return read()
    }
}

/** A parsed snapshot of writer.log with counts scoped to a session id. */
class Snapshot(private val lines: List<String>) {
    fun views(sessionId: String): Int = count("rpc=View", sessionId)
    fun clicks(sessionId: String): Int = count("rpc=Click", sessionId)

    /** Total successful View events (impressions) in the log, across all sessions. */
    fun totalViews(): Int = lines.count { it.contains("rpc=View") && it.contains("result=ok") }

    private fun count(rpc: String, sessionId: String): Int =
        lines.count {
            it.contains(rpc) && it.contains("id=\"$sessionId\"") && it.contains("result=ok")
        }
}

/**
 * Test-side client for the reader ratios. `ratio()` triggers a real reader gRPC
 * call (via the agent) and `log()` reads back reader.log, which records the
 * `views` and `other` operands the reader used, so a test can verify the
 * published value equals `other / views`.
 */
object Reader {
    fun clearLog() { agentRequest("POST", "/clear/reader") }

    /** Perform a reader Read and return the published ratio value. */
    fun ratio(type: String, ad: String = "ad-001", platform: String = "android"): Double {
        val json = agentRequest("GET", "/read?type=$type&ad=$ad&platform=$platform")
        val m = Regex("\"value\"\\s*:\\s*([0-9.eE+-]+)").find(json)
            ?: error("no value in reader response: $json")
        return m.groupValues[1].toDouble()
    }

    fun log(): ReaderSnapshot = ReaderSnapshot(agentRequest("GET", "/log/reader").split("\n"))
}

/** Parsed reader.log. Each Read line carries type, views, other and value. */
class ReaderSnapshot(private val lines: List<String>) {
    data class ReadLine(val type: String, val views: Int, val other: Int, val value: Double)

    /** The most recent Read of the given [type] (vtc/vti), or null if none. */
    fun latest(type: String): ReadLine? =
        lines.filter { it.contains("rpc=Read") && it.contains("type=\"$type\"") }
            .mapNotNull { parse(it) }
            .lastOrNull()

    private fun parse(line: String): ReadLine? {
        val type = Regex("type=\"(\\w+)\"").find(line)?.groupValues?.get(1) ?: return null
        val views = Regex("views=(\\d+)").find(line)?.groupValues?.get(1)?.toInt() ?: return null
        val other = Regex("other=(\\d+)").find(line)?.groupValues?.get(1)?.toInt() ?: return null
        val value = Regex("value=([0-9.]+)").find(line)?.groupValues?.get(1)?.toDouble() ?: return null
        return ReadLine(type, views, other, value)
    }
}
