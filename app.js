import dotenv from "dotenv";
import nodemailer from "nodemailer"
import { connectToMongo } from "./mongo.js";
import utcToZonedTime from "date-fns-tz";

import { add, startOfDay, differenceInDays, format } from "date-fns"

function googleMapLink(mem, date, clubs, locations) {
    const from_location = clubs.find((club) => club.name === mem.club);
    const to_location = locations.find((loc) => loc.name === date.location);
    let from_address =
        from_location.address +
        ",+" +
        from_location.city +
        ",+" +
        from_location.state;
    from_address = from_address.replace(/ /g, "%20");
    let to_address =
        to_location.address + ",+" + to_location.city + ",+" + to_location.state;
    to_address = to_address.replace(/ /g, "%20");
    return `<p><a href=http://maps.google.com/maps?f=d&source=s_d&saddr=${from_address}&daddr=${to_address}>Google Directions</a><p>`;
}
dotenv.config();

console.log("info", process.env.MONGO_URI_PROD)
// testing
const transporter = nodemailer.createTransport({
    host: 'smtp.comcast.net',
    port: 587,
    auth: {
        user: process.env.EMAIL_CAP_COMCAST,
        pass: process.env.COMCAST_PW
    }
});
/* 
let info = await transporter.sendMail({
    from: `"Cap stocks" {process.env.EMAIL_CAP}`, // sender address
    to: process.env.EMAIL_CAP, // list of receivers
    subject: "Hello ✔", // Subject line
    text: "Hello world?", // plain text body
    html: "<b>Hello Cap</b>", // html body
  });

  console.log("Message sent: %s", info.messageId); */
// end test  
try {
    console.log("starting mailer");
    const db = await connectToMongo();

    // have we run today?
    const emailSent = await db
        .collection("emailSent")
        .find({})
        .project({})
        .sort({ _id: -1 })
        .limit(1)
        .toArray();
    if (emailSent.length) {
        const data = emailSent[0].when;
        const now = startOfDay(new Date());
        const checking = startOfDay(data);
        const diff = differenceInDays(checking, now);
        if (diff === 0) {
            console.log("Mail already sent today, not sending again!");
            process.exit(0);
        }
    }

    // testing
    let all = [];
    //process.exit(0);
    // get dates from now till 4 weeks forward
    let dateIn4weeks = add(new Date(), { days: 30 });
    console.log(`In 4 weeks ${dateIn4weeks}`);
    const dates = await db
        .collection("dates")
        .find({ date: { $gte: new Date(), $lt: dateIn4weeks } })
        .sort({ date: 1 })
        .toArray();

    const members = await db
        .collection("members")
        .find({ active: true })
        .project({ _id: 0 })
        .toArray();

    const locations = await db.collection("locations").find().toArray();

    const clubs = await db.collection("clubs").find().toArray();

    const emailMap = await db.collection("emailMap").find().toArray();

    console.log(`Dates found ${dates.length} Members found ${members.length}`);
    let resp = null;
    console.log("first date", dates[0]);
    for (const date of dates) {
        console.log("in loop");
        console.log("the date", date);
        let theDate = startOfDay(date.date);
        let now = startOfDay(new Date());
        const diff = differenceInDays(theDate, now);
        console.log(
            `Date ${format(date.date, "MM/dd/yyyy")} ${date.guest} at ${date.host
            }  is ${diff} days away`
        );
        // check each member of the squad for this data
        // against their reminders.
        for (const mem of members) {
            // TODO reminders may be in string format fix the db so its an array in ints
            let reminders =
                typeof mem.reminders === "object"
                    ? mem.reminders
                    : [parseInt(mem.reminders)];
            for (const rem of reminders) {
                if (
                    rem === diff &&
                    date.squad.find((sq) => sq.name === mem.alias) !== undefined
                ) {
                    // check for email forward
                    const forwardTo = emailMap.find(
                        (e) => e.from.toLowerCase() === mem.email.toLowerCase()
                    );
                    if (forwardTo) mem.email = forwardTo.to;
                    console.log(`reminder needed for ${mem.email}`);
                    // for now just push the email into an arry
                    all.push(mem.email);
                    const dateLocal = utcToZonedTime.utcToZonedTime(date.date, "America/Los_Angeles");

                    let info = await transporter.sendMail({
                        from: 'admin@cornerpins.com', // sender address
                        to: [mem.email], // list of receivers
                        "h:Reply-To": process.env.EMAIL_DON,
                        subject: `${mem.club} Match Club Reminder`, // Subject line
                        text: "Match Club Reminder", // plain text body
                        html: 
                        `<html>
                        <p>Hello ${mem.first ? mem.first : mem.alias},</p>
                        <p>This is a reminder that you are signed up for the match with ${
                          date.host != mem.club ? date.host : date.guest
                        } ` +
                         `in ${
                           locations.find((loc) => loc.name === date.location).city
                         } at ` +
                         `${
                           locations.find((loc) => loc.name === date.location).name
                         } on ` +
                         `${format(dateLocal, "MMMM d yyyy")} at ${format(
                           dateLocal,
                           "hh:mm a"
                         )}.</p>
                         ${
                           date.location != "Double Decker Lanes"
                             ? googleMapLink(mem, date, clubs, locations)
                             : ``
                         }
                         <p>Thanks,<br />${mem.club} Matchmaker<p>
                         <h6><p style=\"color:#007777\">Do not respond to this email. Please contact the Match Maker directly (fireater1959@gmail.com) if you need further information.</p></h6>
                         <h6><p style=\"color:#007777\">If you would like to change the scheduling of these reminders, please logon to the MatchClub site and change the reminder settings in the Your Stuff tab.</p></h6>
                        </html>`,
                      });
                    
                      console.log("Message sent: %s", info.messageId);
                } else {
                    console.log("not sending", mem.alias);
                }
            }
        }
    }
    // update db so we don't do it again
     await db
       .collection("emailSent")
       .insertOne({ when: new Date(), who: all });
    console.log('we are done!');
    process.exit(0);
    
} catch (error) {
    console.log("runMailer exception", error);
    process.exit(1);
}
