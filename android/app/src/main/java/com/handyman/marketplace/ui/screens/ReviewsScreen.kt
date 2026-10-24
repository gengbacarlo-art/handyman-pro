package com.handyman.marketplace.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.handyman.marketplace.models.Review
import com.handyman.marketplace.network.ApiService
import kotlinx.coroutines.launch

@Composable
fun ReviewsScreen(
    navController: androidx.navigation.navController,
    apiService: ApiService,
    handymanId: Int? = null,
    handymanName: String? = null
) {
    var reviews by remember { mutableStateOf<List<Review>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    val coroutineScope = rememberCoroutineScope()
    val isMyReviews = handymanId == null

    LaunchedEffect(Unit) {
        val prefs = LocalContext.current.getSharedPreferences("handyman_prefs", android.content.Context.MODE_PRIVATE)
        val token = prefs.getString("auth_token", "") ?: ""
        coroutineScope.launch {
            try {
                val res = if (isMyReviews) {
                    apiService.getMyReviews("Bearer $token")
                } else {
                    apiService.getHandymanReviews("Bearer $token", handymanId ?: 0)
                }
                if (res.isSuccessful) {
                    reviews = res.body()!!.reviews
                }
            } catch (e: Exception) {
                // ignore
            } finally {
                loading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isMyReviews) "My Reviews" else "Reviews for $handymanName") }
            )
        }
    ) { padding ->
        if (loading) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = androidx.compose.ui.Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            Column(modifier = Modifier.fillMaxSize().padding(padding)) {
                if (reviews.isEmpty()) {
                    Text(text = "No reviews yet", style = MaterialTheme.typography.bodyMedium)
                } else {
                    Text(text = "${reviews.size} review(s)", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 12.dp))

                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(0.dp)
                    ) {
                        items(reviews) { review: Review ->
                            Card(
                                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                                elevation = 2.dp
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
                                    ) {
                                        Text(text = review.client_name ?: "Client", style = MaterialTheme.typography.titleMedium)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.End
                                        ) {
                                            repeat(5) { star ->
                                                Icon(
                                                    imageVector = if (star < review.rating) androidx.compose.material.icons.Icons.Default.Star else androidx.compose.material.icons.Icons.Default.StarOutline,
                                                    contentDescription = "Star",
                                                    tint = MaterialTheme.colorScheme.secondary,
                                                    modifier = Modifier.size(16.dp)
                                                )
                                            }
                                        }
                                    }
                                    Text(text = review.comment ?: "No comment", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                                    Text(text = review.created_at ?: "", style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant), modifier = Modifier.padding(top = 4.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
