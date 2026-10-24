package com.handyman.marketplace.network

import com.handyman.marketplace.models.*
import retrofit2.Response
import retrofit2.http.*
import kotlinx.coroutines.flow.Flow

interface ApiService {

    // Auth
    @POST("auth/register")
    suspend fun register(@Body req: AuthRequest): Response<AuthResponse>

    @POST("auth/login")
    suspend fun login(@Body req: AuthRequest): Response<AuthResponse>

    @GET("auth/me")
    suspend fun me(@Header("Authorization") token: String): Response<MeResponse>

    // Users / Handymen
    @GET("users/handymen")
    suspend fun listHandymen(@Header("Authorization") token: String, @Query("category") category: String?): Response<HandymenResponse>

    @GET("users/handymen/{id}")
    suspend fun getHandyman(@Header("Authorization") token: String, @Path("id") id: Int): Response<HandymanDetailResponse>

    // Jobs
    @POST("jobs")
    suspend fun createJob(@Header("Authorization") token: String, @Body req: CreateJobRequest): Response<JobResponse>

    @GET("jobs")
    suspend fun listJobs(@Header("Authorization") token: String): Response<JobsResponse>

    @GET("jobs/{id}")
    suspend fun getJob(@Header("Authorization") token: String, @Path("id") id: Int): Response<JobResponse>

    @PATCH("jobs/{id}/status")
    suspend fun updateJobStatus(@Header("Authorization") token: String, @Path("id") id: Int, @Body req: UpdateJobStatusRequest): Response<MessageResponse>

    // Payments
    @POST("payments/create-intent")
    suspend fun createPaymentIntent(@Header("Authorization") token: String, @Body req: CreatePaymentRequest): Response<PaymentIntentResponse>

    @POST("payments/confirm")
    suspend fun confirmPayment(@Header("Authorization") token: String, @Body req: ConfirmPaymentRequest): Response<PaymentConfirmResponse>

    @GET("payments/earnings")
    suspend fun getEarnings(@Header("Authorization") token: String): Response<EarningsResponse>

    // Admin
    // Reviews
    @POST("reviews")
    suspend fun createReview(@Header("Authorization") token: String, @Body req: ReviewRequest): Response<MessageResponse>

    @GET("reviews/handyman/{handymanId}")
    suspend fun getHandymanReviews(@Header("Authorization") token: String, @Path("handymanId") id: Int): Response<ReviewResponse>

    @GET("reviews/me")
    suspend fun getMyReviews(@Header("Authorization") token: String): Response<ReviewResponse>

    @GET("admin/stats")
    suspend fun adminStats(@Header("Authorization") token: String): Response<AdminStatsResponse>

    @GET("admin/users")
    suspend fun adminUsers(@Header("Authorization") token: String): Response<AdminUsersResponse>

    @GET("admin/jobs")
    suspend fun adminJobs(@Header("Authorization") token: String): Response<AdminJobsResponse>

    @PATCH("admin/users/{id}/role")
    suspend fun adminSetRole(@Header("Authorization") token: String, @Path("id") id: Int, @Body req: SetRoleRequest): Response<MessageResponse>
}
