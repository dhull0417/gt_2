package expo.modules.richshare

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

// Android Sharesheet with a title and thumbnail in its preview (Android 10+), while apps receive
// only the message text. The picture is a file in the app's cache, exposed through the
// FileProvider that expo-file-system already declares (authority <package>.FileSystemFileProvider,
// which covers the cache folder). See modules/rich-share/index.ts.
class RichShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RichShare")

    AsyncFunction("share") { message: String, title: String, imageUri: String? ->
      val activity = appContext.throwingActivity
      val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, message)
        putExtra(Intent.EXTRA_TITLE, title)
      }

      contentUriFor(imageUri, activity.packageName)?.let { uri ->
        // The Sharesheet reads the preview thumbnail from ClipData (not EXTRA_STREAM), and needs
        // permission to read it. The text stays the only thing sent.
        send.clipData = ClipData.newRawUri(null, uri)
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }

      activity.startActivity(Intent.createChooser(send, null))
      // The chooser doesn't report what the person picked.
      "unknown"
    }
  }

  private fun contentUriFor(imageUri: String?, packageName: String): Uri? {
    if (imageUri.isNullOrEmpty()) return null
    return try {
      val path = Uri.parse(imageUri).path ?: return null
      val file = File(path)
      if (!file.exists()) return null
      val context = appContext.reactContext ?: return null
      FileProvider.getUriForFile(context, "$packageName.FileSystemFileProvider", file)
    } catch (e: Exception) {
      null
    }
  }
}
