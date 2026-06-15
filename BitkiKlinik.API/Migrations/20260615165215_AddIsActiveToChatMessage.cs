using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BitkiKlinik.API.Migrations
{
    /// <inheritdoc />
    public partial class AddIsActiveToChatMessage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "ChatMessages",
                type: "bit",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "ChatMessages");
        }
    }
}
