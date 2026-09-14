package com.englishdrive

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.englishdrive.audio.CommuteAudioPackage
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.Dns
import java.net.Inet4Address
import java.net.InetAddress

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(CommuteAudioPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Some mobile Wi-Fi networks advertise IPv6 without a working route to
    // Gemini. Prefer IPv4 for this host while retaining IPv6 as a fallback.
    OkHttpClientProvider.setOkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder().dns(object : Dns {
        override fun lookup(hostname: String): List<InetAddress> {
        val addresses = Dns.SYSTEM.lookup(hostname)
        return if (hostname.equals("generativelanguage.googleapis.com", ignoreCase = true)) {
          addresses.sortedBy { if (it is Inet4Address) 0 else 1 }
        } else {
          addresses
        }
        }
      }).build()
    }
    loadReactNative(this)
  }
}
