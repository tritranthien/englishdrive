package com.englishdrive.chat

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.UUID

class ChatStorageModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val store = object : SQLiteOpenHelper(context, "companion_chat.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
      db.execSQL("CREATE TABLE cache (account TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(account,name))")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
  }
  override fun getName() = "ChatStorage"
  @ReactMethod fun newId(promise: Promise) = promise.resolve(UUID.randomUUID().toString())
  @ReactMethod fun read(userId: String, key: String, promise: Promise) {
    try {
      store.readableDatabase.query("cache", arrayOf("payload"), "account=? AND name=?", arrayOf(userId,key), null,null,null).use { cursor ->
        promise.resolve(if (cursor.moveToFirst()) cursor.getString(0) else null)
      }
    } catch (error: Exception) { promise.reject("CHAT_CACHE_READ", "Không đọc được bộ nhớ tin nhắn", error) }
  }
  @ReactMethod fun write(userId: String, key: String, payload: String, promise: Promise) {
    try {
      val values = ContentValues().apply { put("account", userId); put("name", key); put("payload", payload) }
      check(store.writableDatabase.insertWithOnConflict("cache", null, values, SQLiteDatabase.CONFLICT_REPLACE) != -1L)
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("CHAT_CACHE_WRITE", "Không lưu được tin nhắn trên máy", error) }
  }
  override fun invalidate() { store.close(); super.invalidate() }
}
