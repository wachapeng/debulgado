package com.debulgado.pos  // <- keep YOUR project's package name here (the first line Android Studio wrote)

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Debulgado's Coffee Shop POS - Android app.
 *
 * The whole screen is a WebView that opens the POS website (the address is "pos_url" in
 * res/values/strings.xml). The website saves every sale on the phone first, so the app
 * keeps working with no internet and uploads the sales by itself when it is back online.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var root: View
    private lateinit var webView: WebView
    private lateinit var statusBarSpace: View
    private lateinit var navBarSpace: View
    private val posUrl by lazy { getString(R.string.pos_url).trim() }

    // Menu → Edit product → "Upload photo" opens the phone's photo picker.
    private var photoCallback: ValueCallback<Array<Uri>>? = null
    private val pickPhoto = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        photoCallback?.onReceiveValue(uri?.let { arrayOf(it) })
        photoCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT)) // white icons on the brown top bar
        setContentView(R.layout.activity_main)
        root = findViewById(R.id.main)
        webView = findViewById(R.id.web_view)
        statusBarSpace = findViewById(R.id.status_bar_space)
        navBarSpace = findViewById(R.id.nav_bar_space)

        // Leave room for the phone's status bar (top), navigation bar and keyboard (bottom).
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, 0, bars.right, 0)
            statusBarSpace.layoutParams = statusBarSpace.layoutParams.apply { height = bars.top }
            navBarSpace.layoutParams = navBarSpace.layoutParams.apply { height = maxOf(bars.bottom, keyboard.bottom) }
            WindowInsetsCompat.CONSUMED
        }

        setUpWebView()

        // Back button: the POS first closes whatever is open (receipt, dialog, order sheet),
        // then goes back to the order screen. On the order screen, back leaves the app.
        onBackPressedDispatcher.addCallback(object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("window.handleBack ? window.handleBack() : false") { handled ->
                    if (handled != "true") finish()
                }
            }
        })

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(posUrl)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setUpWebView() {
        val debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        WebView.setWebContentsDebuggingEnabled(debuggable) // lets you inspect the page from Chrome while testing

        webView.setBackgroundColor(Color.parseColor("#3A2616"))
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true                  // saved sales, settings and the offline copy live here
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false  // the payment chime
            setSupportZoom(false)
            userAgentString = "$userAgentString DebulgadoPOSApp/1.0" // tells the POS it runs inside this app
        }
        webView.addJavascriptInterface(AppBridge(), "AndroidApp")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                photoCallback?.onReceiveValue(null) // a picker that was left open
                photoCallback = callback
                val type = params.acceptTypes.firstOrNull { it.isNotBlank() } ?: "image/*"
                return try {
                    pickPhoto.launch(type)
                    true
                } catch (e: ActivityNotFoundException) {
                    photoCallback = null
                    false
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == Uri.parse(posUrl).host) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } // other websites open in the browser
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                // Only happens if the POS has never been opened with internet on this phone.
                if (request.isForMainFrame) {
                    view.loadDataWithBaseURL(null, offlinePage(), "text/html", "utf-8", null)
                }
            }
        }
    }

    /** Functions the POS page can call: AndroidApp.print(), AndroidApp.setBarColors(...), AndroidApp.retry(). */
    inner class AppBridge {

        /** Opens the phone's print screen for the receipt (a printer, a Bluetooth printer app, or Save as PDF). */
        @JavascriptInterface
        fun print() = runOnUiThread {
            val printManager = getSystemService(PRINT_SERVICE) as PrintManager
            val jobName = getString(R.string.app_name) + " receipt"
            printManager.print(jobName, webView.createPrintDocumentAdapter(jobName), PrintAttributes.Builder().build())
        }

        /** Colors the strips behind the status bar and navigation bar to match the POS (light or dark mode). */
        @JavascriptInterface
        fun setBarColors(top: String, bottom: String) = runOnUiThread {
            val topColor = parseColor(top) ?: return@runOnUiThread
            val bottomColor = parseColor(bottom) ?: return@runOnUiThread
            root.setBackgroundColor(topColor)
            statusBarSpace.setBackgroundColor(topColor)
            navBarSpace.setBackgroundColor(bottomColor)
            WindowCompat.getInsetsController(window, window.decorView).apply {
                isAppearanceLightStatusBars = isLight(topColor)
                isAppearanceLightNavigationBars = isLight(bottomColor)
            }
        }

        /** "Try again" on the no-internet page. */
        @JavascriptInterface
        fun retry() = runOnUiThread { webView.loadUrl(posUrl) }
    }

    private fun parseColor(value: String): Int? = runCatching { Color.parseColor(value.trim()) }.getOrNull()

    private fun isLight(color: Int): Boolean =
        0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color) > 160

    private fun offlinePage(): String = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
                 background: #3A2616; font-family: sans-serif; }
          .card { background: #FAF6EF; color: #231C15; border-radius: 20px; padding: 28px 24px; margin: 20px; max-width: 360px; }
          h1 { font-size: 22px; margin: 0 0 8px; color: #13294B; }
          p { color: #7B6A58; line-height: 1.5; margin: 0 0 18px; }
          button { width: 100%; padding: 14px; border: 0; border-radius: 12px; background: #13294B; color: #fff; font-size: 16px; }
        </style></head><body><div class="card">
          <h1>No internet</h1>
          <p>Connect this phone to the internet once to open the POS. After the first time it also works offline.</p>
          <button onclick="AndroidApp.retry()">Try again</button>
        </div></body></html>
    """.trimIndent()

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
