package com.englishdrive.chat

import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.englishdrive.MainActivity
import com.englishdrive.R
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class ChatMessagingService : FirebaseMessagingService() {
  override fun onNewToken(token: String) {
    ChatNotificationState.emit("chatPushToken")
  }
  override fun onMessageReceived(message: RemoteMessage) {
    val user = message.data["userId"] ?: return
    if (ChatNotificationState.preferences(this).getString("activeUser", null) != user) return
    val thread = message.data["threadId"] ?: return
    ChatNotificationState.emit("chatNotificationReceived")
    if (ChatNotificationState.visibleThread == thread) return
    val intent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra("threadId",thread); putExtra("userId",user)
      data = android.net.Uri.parse("englishdrive://chat/$thread")
    }
    val pending = PendingIntent.getActivity(this, thread.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(this,"friends")
      .setSmallIcon(R.drawable.ic_chat_notification).setContentTitle(message.notification?.title ?: "Bạn bè EnglishDrive")
      .setContentText(message.notification?.body ?: "Bạn có tin nhắn mới")
      .setContentIntent(pending).setAutoCancel(true).build()
    try { NotificationManagerCompat.from(this).notify(thread,0,notification) } catch (_: SecurityException) { }
  }
}
