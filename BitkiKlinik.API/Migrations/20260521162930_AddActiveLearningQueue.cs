using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BitkiKlinik.API.Migrations
{
    /// <inheritdoc />
    public partial class AddActiveLearningQueue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ActiveLearningQueue",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ScanId = table.Column<int>(type: "int", nullable: true),
                    ImagePath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    PredictedDisease = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Confidence = table.Column<double>(type: "float", nullable: false),
                    CorrectedDisease = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Source = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ReviewedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActiveLearningQueue", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ActiveLearningQueue_PlantScans_ScanId",
                        column: x => x.ScanId,
                        principalTable: "PlantScans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ActiveLearningQueue_CreatedAt",
                table: "ActiveLearningQueue",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_ActiveLearningQueue_ScanId",
                table: "ActiveLearningQueue",
                column: "ScanId");

            migrationBuilder.CreateIndex(
                name: "IX_ActiveLearningQueue_Status",
                table: "ActiveLearningQueue",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ActiveLearningQueue");
        }
    }
}
